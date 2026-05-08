const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const fetch = global.fetch;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TOMTOM_KEY = process.env.TOMTOM_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const CHAT_ID = process.env.CHAT_ID;

const TAX_RATE = 0.16;
const KAWA_SHARE = 0.40;
const FIXED_COMPANY = 1000;
const FIXED_INSURANCE = 500;
const DATA_FILE = "/tmp/finance.json";

if (!TELEGRAM_TOKEN) throw new Error("Missing TELEGRAM_TOKEN");

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

function emptyData() {
  return {
    salam: [],
    kawa: [],
    expenses: [],
    alertedFlights: {}
  };
}

function loadData() {
  try {
    return { ...emptyData(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  } catch {
    return emptyData();
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function smartParseNumber(str) {
  if (!str) return 0;
  const s = String(str).replace("€", "").replace(/\s/g, "").trim();

  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      return parseFloat(s.replace(/\./g, "").replace(",", "."));
    }
    return parseFloat(s.replace(/,/g, ""));
  }

  if (s.includes(",")) return parseFloat(s.replace(",", "."));
  return parseFloat(s);
}

function fmt(n) {
  return `${Number(n || 0).toFixed(2).replace(".", ",")} €`;
}

function parseReport(text) {
  const getNum = (label) => {
    const re = new RegExp(label + "\\s*:?\\s*(-?[\\d.,]+)\\s*€?", "i");
    const m = text.match(re);
    return m ? smartParseNumber(m[1]) : 0;
  };

  const dateRange = text.match(/(\d+\s+\w+)\s*[–-]\s*(\d+\s+\w+)/);

  return {
    period: dateRange ? `${dateRange[1]} - ${dateRange[2]}` : "Unknown period",
    fahrten: parseInt(getNum("Fahrten")) || 0,
    netto: getNum("Netto-Fahrpreis"),
    aktionen: getNum("Aktionen"),
    trinkgeld: getNum("Trinkgeld"),
    gesamt: getNum("Gesamtumsätze"),
    bargeld: Math.abs(getNum("Eingenommenes Bargeld")),
    addedAt: new Date().toISOString()
  };
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const HOME_BASE = { name: "Herne", lat: 51.5393, lon: 7.2261 };

const CITIES = [
  { id: "bochum", name: "Bochum", lat: 51.4818, lon: 7.2197 },
  { id: "dortmund", name: "Dortmund", lat: 51.5136, lon: 7.4653 },
  { id: "essen", name: "Essen", lat: 51.4556, lon: 7.0116 },
  { id: "duisburg", name: "Duisburg", lat: 51.4344, lon: 6.7623 },
  { id: "duesseldorf", name: "Düsseldorf", lat: 51.2277, lon: 6.7735 },
  { id: "gelsenkirchen", name: "Gelsenkirchen", lat: 51.5177, lon: 7.0857 },
  { id: "oberhausen", name: "Oberhausen", lat: 51.4708, lon: 6.8513 },
  { id: "muelheim", name: "Mülheim", lat: 51.4275, lon: 6.8826 },
  { id: "hagen", name: "Hagen", lat: 51.3671, lon: 7.4633 },
  { id: "wuppertal", name: "Wuppertal", lat: 51.2562, lon: 7.1508 },
  { id: "herne", name: "Herne", lat: 51.5393, lon: 7.2261 },
  { id: "recklinghausen", name: "Recklinghausen", lat: 51.6135, lon: 7.1972 },
  { id: "witten", name: "Witten", lat: 51.4434, lon: 7.3357 },
  { id: "marl", name: "Marl", lat: 51.6571, lon: 7.0908 },
  { id: "hattingen", name: "Hattingen", lat: 51.3994, lon: 7.1857 },
  { id: "castrop", name: "Castrop-Rauxel", lat: 51.5503, lon: 7.3107 },
  { id: "unna", name: "Unna", lat: 51.5365, lon: 7.6890 }
];

for (const c of CITIES) {
  c.distFromHerne = distanceKm(HOME_BASE.lat, HOME_BASE.lon, c.lat, c.lon);
}

const AIRPORTS = [
  { code: "DUS", name: "Düsseldorf" },
  { code: "DTM", name: "Dortmund" },
  { code: "CGN", name: "Köln/Bonn" }
];

async function fetchTraffic(city) {
  if (!TOMTOM_KEY) return null;

  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${city.lat},${city.lon}&unit=KMPH&key=${TOMTOM_KEY}`;

  const r = await fetch(url);
  if (!r.ok) return null;

  const d = await r.json();
  const seg = d.flowSegmentData;
  if (!seg) return null;

  const ratio = seg.currentSpeed / seg.freeFlowSpeed;

  let level = "LOW";
  if (ratio < 0.4) level = "CRITICAL";
  else if (ratio < 0.6) level = "HIGH";
  else if (ratio < 0.85) level = "MEDIUM";

  return {
    current: Math.round(seg.currentSpeed),
    free: Math.round(seg.freeFlowSpeed),
    ratio: Math.round(ratio * 100),
    level
  };
}

async function fetchArrivals(code) {
  if (!RAPIDAPI_KEY) return [];

  const now = new Date();
  const past = new Date(now.getTime() - 60 * 60 * 1000);
  const f = (d) => d.toISOString().slice(0, 16);

  const url =
    `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${code}/${f(past)}/${f(now)}?direction=Arrival&withCancelled=false`;

  const r = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": RAPIDAPI_KEY,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
    }
  });

  if (!r.ok) throw new Error(`AeroDataBox ${r.status}`);

  const d = await r.json();

  return (d.arrivals || []).map((x) => ({
    flight: x.number || "?",
    origin: x.movement?.airport?.name || "?",
    time: x.movement?.actualTime?.local || x.movement?.scheduledTime?.local || "?"
  }));
}

async function handleDriverReport(msg, driver) {
  const data = loadData();
  const parsed = parseReport(msg.text);

  if (!parsed.gesamt) {
    return bot.sendMessage(msg.chat.id,
`❌ ما قدرت أقرأ التقرير.

أرسل بهذا الشكل:

${driver}
6 Apr - 13 Apr
Fahrten: 112
Netto-Fahrpreis: 1181.61
Aktionen: 370.00
Trinkgeld: 37.62
Gesamtumsätze: 1589.23
Eingenommenes Bargeld: -704.99`);
  }

  data[driver].push(parsed);
  saveData(data);

  return bot.sendMessage(msg.chat.id,
`✅ تم تسجيل تقرير ${driver}

الفترة: ${parsed.period}
الرحلات: ${parsed.fahrten}
Netto: ${fmt(parsed.netto)}
Aktionen: ${fmt(parsed.aktionen)}
Trinkgeld: ${fmt(parsed.trinkgeld)}
Gesamt: ${fmt(parsed.gesamt)}
Bargeld: ${fmt(parsed.bargeld)}`);
}

async function handleExpense(msg, type, label) {
  const m = msg.text.match(/([\d.,]+)/);
  if (!m) return bot.sendMessage(msg.chat.id, `مثال: ${type} 60`);

  const amount = smartParseNumber(m[1]);
  const data = loadData();

  data.expenses.push({
    type,
    amount,
    date: new Date().toISOString()
  });

  saveData(data);

  return bot.sendMessage(msg.chat.id, `✅ تم تسجيل ${label}: ${fmt(amount)}`);
}

async function handleReport(msg) {
  const data = loadData();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const salam = data.salam.filter(x => x.addedAt >= monthStart);
  const kawa = data.kawa.filter(x => x.addedAt >= monthStart);
  const expenses = data.expenses.filter(x => x.date >= monthStart);

  const sumDriver = (arr) => arr.reduce((s, r) => {
    s.fahrten += r.fahrten;
    s.netto += r.netto;
    s.aktionen += r.aktionen;
    s.trinkgeld += r.trinkgeld;
    s.gesamt += r.gesamt;
    s.bargeld += r.bargeld;
    return s;
  }, { fahrten: 0, netto: 0, aktionen: 0, trinkgeld: 0, gesamt: 0, bargeld: 0 });

  const S = sumDriver(salam);
  const K = sumDriver(kawa);

  const salamTax = (S.netto + S.aktionen) * TAX_RATE;
  const salamNet = S.gesamt - salamTax;

  const kawaShare = K.gesamt * KAWA_SHARE;
  const ownerFromKawa = K.gesamt - kawaShare;
  const kawaTax = (K.netto + K.aktionen) * TAX_RATE;
  const ownerFromKawaNet = ownerFromKawa - kawaTax;

  const exp = expenses.reduce((a, e) => {
    a[e.type] = (a[e.type] || 0) + e.amount;
    return a;
  }, {});

  const fuel = exp.fuel || 0;
  const repair = exp.repair || 0;
  const wash = exp.wash || 0;

  const totalExp = FIXED_COMPANY + FIXED_INSURANCE + fuel + repair + wash;
  const grossOwner = salamNet + ownerFromKawaNet;
  const netOwner = grossOwner - totalExp;

  return bot.sendMessage(msg.chat.id,
`📊 التقرير الشهري

━━━━━━━━━━━━━━
سلام (${S.fahrten} رحلة)
Gesamt: ${fmt(S.gesamt)}
Steuer 16%: -${fmt(salamTax)}
صافي سلام: ${fmt(salamNet)}

━━━━━━━━━━━━━━
كاوا (${K.fahrten} رحلة)
Gesamt: ${fmt(K.gesamt)}
حصة كاوا 40%: ${fmt(kawaShare)}
حصتك 60%: ${fmt(ownerFromKawa)}
Steuer 16%: -${fmt(kawaTax)}
صافي حصتك: ${fmt(ownerFromKawaNet)}

━━━━━━━━━━━━━━
المصاريف
شركة: ${fmt(FIXED_COMPANY)}
تأمين: ${fmt(FIXED_INSURANCE)}
بنزين: ${fmt(fuel)}
تصليح: ${fmt(repair)}
غسيل: ${fmt(wash)}
المجموع: ${fmt(totalExp)}

━━━━━━━━━━━━━━
دخلك قبل المصاريف: ${fmt(grossOwner)}
ربحك الصافي: ${fmt(netOwner)}
لكاوا: ${fmt(kawaShare)}`);
}

async function handleCash(msg) {
  const data = loadData();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const salam = data.salam.filter(x => x.addedAt >= monthStart);
  const kawa = data.kawa.filter(x => x.addedAt >= monthStart);
  const expenses = data.expenses.filter(x => x.date >= monthStart);

  const sum = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);

  const salamCash = sum(salam, "bargeld");
  const kawaCash = sum(kawa, "bargeld");
  const kawaTotal = sum(kawa, "gesamt");
  const kawaShare = kawaTotal * KAWA_SHARE;
  const expSum = expenses.reduce((s, x) => s + x.amount, 0);

  const cashOnHand = salamCash + kawaCash - kawaShare - expSum;

  return bot.sendMessage(msg.chat.id,
`💶 ملخص الكاش

كاش سلام: ${fmt(salamCash)}
كاش كاوا: ${fmt(kawaCash)}
حصة كاوا 40%: -${fmt(kawaShare)}
المصاريف: -${fmt(expSum)}

━━━━━━━━━━━━━━
الكاش المفروض يكون معك:
${fmt(cashOnHand)}`);
}

async function handleReset(msg) {
  saveData(emptyData());
  return bot.sendMessage(msg.chat.id, "✅ تم مسح كل البيانات");
}

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const text = msg.text.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith("/salam") || lower.startsWith("salam") || text.startsWith("سلام")) {
    msg.text = text.replace(/^\/?salam/i, "salam");
    return handleDriverReport(msg, "salam");
  }

  if (lower.startsWith("/kawa") || lower.startsWith("kawa") || text.startsWith("كاوا")) {
    msg.text = text.replace(/^\/?kawa/i, "kawa");
    return handleDriverReport(msg, "kawa");
  }

  if (lower.startsWith("/fuel") || text.startsWith("بنزين")) {
    return handleExpense(msg, "fuel", "بنزين");
  }

  if (lower.startsWith("/repair") || text.startsWith("تصليح")) {
    return handleExpense(msg, "repair", "تصليح");
  }

  if (lower.startsWith("/wash") || text.startsWith("غسيل")) {
    return handleExpense(msg, "wash", "غسيل");
  }

  if (lower === "/report" || text === "تقرير") return handleReport(msg);
  if (lower === "/cash" || text === "كاش") return handleCash(msg);
  if (lower === "/reset" || text === "مسح البيانات") return handleReset(msg);

  if (lower === "/start" || lower === "/help" || text === "مساعدة") {
    return bot.sendMessage(msg.chat.id,
`✅ NRW Surge Bot v8

الأوامر المالية:
/salam - تسجيل دخل سلام
/kawa - تسجيل دخل كاوا
/fuel 60 - فاتورة بنزين
/repair 250 - فاتورة تصليح
/wash 15 - فاتورة غسيل
/report - التقرير الشهري
/cash - ملخص الكاش
/reset - مسح البيانات

أوامر الحركة:
/cities
/scan bochum
/flights`);
  }

  if (lower === "/cities") {
    return bot.sendMessage(msg.chat.id,
      CITIES.map(c => `${c.id} - ${c.name} (${c.distFromHerne} km)`).join("\n")
    );
  }

  if (lower.startsWith("/scan")) {
    const cityId = lower.split(/\s+/)[1];
    if (!cityId) return bot.sendMessage(msg.chat.id, "مثال: /scan bochum");

    const city = CITIES.find(c => c.id === cityId);
    if (!city) return bot.sendMessage(msg.chat.id, "❌ المدينة غير موجودة. اكتب /cities");

    try {
      const traffic = await fetchTraffic(city);
      if (!traffic) return bot.sendMessage(msg.chat.id, "❌ ما قدرت أجيب بيانات الزحمة");

      return bot.sendMessage(msg.chat.id,
`🚦 ${city.name}

الحالة: ${traffic.level}
السرعة الحالية: ${traffic.current} km/h
السرعة الطبيعية: ${traffic.free} km/h
النسبة: ${traffic.ratio}%`);
    } catch (e) {
      return bot.sendMessage(msg.chat.id, `❌ خطأ: ${e.message}`);
    }
  }

  if (lower === "/flights") {
    let out = "✈️ آخر الهبوط:\n\n";

    for (const ap of AIRPORTS) {
      try {
        const flights = await fetchArrivals(ap.code);
        out += `${ap.name} (${ap.code}): ${flights.length}\n`;
        for (const f of flights.slice(0, 5)) {
          out += `- ${f.flight} من ${f.origin}\n`;
        }
        out += "\n";
      } catch (e) {
        out += `${ap.name}: خطأ ${e.message}\n\n`;
      }
    }

    return bot.sendMessage(msg.chat.id, out);
  }
});

console.log("NRW Surge Bot v8 started.");

if (CHAT_ID) {
  bot.sendMessage(CHAT_ID, "✅ NRW Surge Bot v8 started.");
}
