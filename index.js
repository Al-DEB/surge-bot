const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
const fs = require("fs");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TOMTOM_KEY     = process.env.TOMTOM_KEY;
const APIFY_TOKEN    = process.env.APIFY_TOKEN;
const RAPIDAPI_KEY   = process.env.RAPIDAPI_KEY;
const CHAT_ID        = process.env.CHAT_ID;

const TRAFFIC_INTERVAL = 3 * 60 * 1000;
const FLIGHT_INTERVAL  = 2 * 60 * 60 * 1000;
const TAX_RATE         = 0.16;
const KAWA_SHARE       = 0.40;
const FIXED_COMPANY    = 1000;
const FIXED_INSURANCE  = 500;

const DATA_FILE = "/tmp/finance.json";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ─── DATA STORAGE ─────────────────────────────────────────────────────────────
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return { salam:[], kawa:[], expenses:[] }; }
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

// ─── PARSE FAHRLY/UBER REPORT ─────────────────────────────────────────────────
// Handles all formats:
//   German:   1.181,61  →  1181.61
//   English:  1181.61   →  1181.61
//   Plain:    1181      →  1181
//   Mixed:    1,181.61  →  1181.61
function smartParseNumber(str) {
  if (!str) return 0;
  const s = str.trim();
  const hasComma = s.includes(",");
  const hasDot   = s.includes(".");

  // Both present → the LAST one is the decimal separator
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // German: 1.181,61
      return parseFloat(s.replace(/\./g, "").replace(",", "."));
    } else {
      // English: 1,181.61
      return parseFloat(s.replace(/,/g, ""));
    }
  }
  // Only comma → could be decimal (37,62) or thousands (1,000)
  if (hasComma) {
    const parts = s.split(",");
    // If last group has 1-2 digits → decimal
    if (parts[parts.length - 1].length <= 2) {
      return parseFloat(s.replace(",", "."));
    }
    // Otherwise → thousands separator
    return parseFloat(s.replace(/,/g, ""));
  }
  // Only dot → could be decimal (1181.61) or thousands (1.181)
  if (hasDot) {
    const parts = s.split(".");
    // If last group has 1-2 digits → decimal
    if (parts[parts.length - 1].length <= 2) {
      return parseFloat(s);
    }
    // Otherwise → thousands separator (rare)
    return parseFloat(s.replace(/\./g, ""));
  }
  // No separator → plain integer
  return parseFloat(s);
}

function parseReport(text) {
  const num = (label) => {
    const re = new RegExp(label + "\\s*:?\\s*(-?[\\d.,]+)\\s*€?", "i");
    const m = text.match(re);
    if (!m) return 0;
    return smartParseNumber(m[1]);
  };

  const dateRange = text.match(/(\d+\s+\w+)\s*[–-]\s*(\d+\s+\w+)/);

  return {
    period: dateRange ? `${dateRange[1]} – ${dateRange[2]}` : "Unknown period",
    fahrten: parseInt(num("Fahrten")) || 0,
    netto:   num("Netto-Fahrpreis"),
    aktionen: num("Aktionen"),
    trinkgeld: num("Trinkgeld"),
    gesamt:  num("Gesamtumsätze"),
    bargeld: Math.abs(num("Eingenommenes Bargeld")),
    addedAt: new Date().toISOString(),
  };
}

// ─── FORMAT MONEY ─────────────────────────────────────────────────────────────
const fmt = (n) => `${n.toFixed(2).replace(".", ",")} €`;

// ─── CITIES + STREETS (truncated for readability — same as v5) ───────────────
const CITIES = [
  { id:"bochum", name:"Bochum", searchArea:"Bochum, Germany",
    streets:[
      { name:"Castroper Str / Ruhrstadion", lat:51.4900, lon:7.2358 },
      { name:"Jahrhunderthalle",             lat:51.4863, lon:7.2089 },
      { name:"Kortumstraße",                 lat:51.4815, lon:7.2188 },
      { name:"Brüderstraße / Bermudadreieck",lat:51.4810, lon:7.2196 },
      { name:"Viktoriastraße",               lat:51.4789, lon:7.2192 },
      { name:"Stühmeyerstraße",              lat:51.4838, lon:7.2253 },
      { name:"Hbf Bochum",                   lat:51.4787, lon:7.2234 },
      { name:"Herner Straße",                lat:51.4900, lon:7.2173 },
      { name:"Wittener Straße",              lat:51.4793, lon:7.2390 },
      { name:"Universitätsstraße (RUB)",     lat:51.4470, lon:7.2657 },
    ] },
  { id:"dortmund", name:"Dortmund", searchArea:"Dortmund, Germany",
    streets:[
      { name:"Strobelallee / Signal Iduna", lat:51.4925, lon:7.4519 },
      { name:"Westfalenhalle",              lat:51.4978, lon:7.4548 },
      { name:"Brückstraße",                 lat:51.5141, lon:7.4684 },
      { name:"Kleppingstraße",              lat:51.5142, lon:7.4669 },
      { name:"Hbf Dortmund",                lat:51.5179, lon:7.4593 },
      { name:"Kronprinzenstraße",           lat:51.5237, lon:7.4621 },
    ] },
  { id:"essen", name:"Essen", searchArea:"Essen, Germany",
    streets:[
      { name:"Rüttenscheider Straße",  lat:51.4366, lon:7.0026 },
      { name:"Hbf Essen",              lat:51.4512, lon:7.0139 },
      { name:"Kettwiger Straße",       lat:51.4555, lon:7.0103 },
      { name:"Viehofer Straße",        lat:51.4582, lon:7.0156 },
      { name:"Grugahalle",             lat:51.4376, lon:7.0179 },
    ] },
  { id:"duisburg", name:"Duisburg", searchArea:"Duisburg, Germany",
    streets:[
      { name:"Königstraße",        lat:51.4341, lon:6.7610 },
      { name:"Hbf Duisburg",       lat:51.4314, lon:6.7748 },
      { name:"Düsseldorfer Str",   lat:51.4255, lon:6.7681 },
      { name:"MSV Arena",          lat:51.4082, lon:6.7779 },
    ] },
  { id:"duesseldorf", name:"Düsseldorf", searchArea:"Düsseldorf, Germany",
    streets:[
      { name:"Bolkerstraße / Altstadt",  lat:51.2271, lon:6.7740 },
      { name:"Königsallee",              lat:51.2238, lon:6.7790 },
      { name:"Hbf Düsseldorf",           lat:51.2200, lon:6.7940 },
      { name:"Flughafen DUS",            lat:51.2895, lon:6.7668 },
      { name:"Merkur Spiel-Arena",       lat:51.2614, lon:6.7333 },
      { name:"Charlottenstraße",         lat:51.2272, lon:6.7891 },
    ] },
  { id:"gelsenkirchen", name:"Gelsenkirchen", searchArea:"Gelsenkirchen, Germany",
    streets:[
      { name:"Veltins-Arena",      lat:51.5547, lon:7.0676 },
      { name:"Bahnhofstraße GE",   lat:51.5071, lon:7.1015 },
      { name:"Hbf Gelsenkirchen",  lat:51.5052, lon:7.1022 },
    ] },
  { id:"oberhausen", name:"Oberhausen", searchArea:"Oberhausen, Germany",
    streets:[
      { name:"CentrO",                lat:51.4943, lon:6.8762 },
      { name:"König-Pilsener-Arena",  lat:51.4926, lon:6.8772 },
      { name:"Hbf Oberhausen",        lat:51.4736, lon:6.8519 },
    ] },
  { id:"muelheim", name:"Mülheim", searchArea:"Mülheim an der Ruhr, Germany",
    streets:[
      { name:"Hbf Mülheim",       lat:51.4314, lon:6.8830 },
      { name:"Schloßstraße",      lat:51.4305, lon:6.8855 },
    ] },
  { id:"hagen", name:"Hagen", searchArea:"Hagen, Germany",
    streets:[
      { name:"Hbf Hagen",          lat:51.3667, lon:7.4624 },
      { name:"Elberfelder Straße", lat:51.3613, lon:7.4715 },
    ] },
  { id:"wuppertal", name:"Wuppertal", searchArea:"Wuppertal, Germany",
    streets:[
      { name:"Hbf Wuppertal",      lat:51.2549, lon:7.1495 },
      { name:"Luisenstraße",       lat:51.2586, lon:7.1438 },
      { name:"Kipdorf",            lat:51.2575, lon:7.1500 },
    ] },
  { id:"herne", name:"Herne", searchArea:"Herne, Germany",
    streets:[
      { name:"Hbf Herne",        lat:51.5393, lon:7.2261 },
      { name:"Wanne-Eickel Hbf", lat:51.5316, lon:7.1635 },
      { name:"Cranger Kirmes",   lat:51.5364, lon:7.1503 },
    ] },
  { id:"recklinghausen", name:"Recklinghausen", searchArea:"Recklinghausen, Germany",
    streets:[
      { name:"Hbf Recklinghausen", lat:51.6135, lon:7.1815 },
      { name:"Altstadt",           lat:51.6147, lon:7.1972 },
    ] },
  { id:"witten", name:"Witten", searchArea:"Witten, Germany",
    streets:[
      { name:"Hbf Witten",  lat:51.4387, lon:7.3327 },
      { name:"Ruhrstraße",  lat:51.4438, lon:7.3349 },
    ] },
  { id:"marl", name:"Marl", searchArea:"Marl, Germany",
    streets:[
      { name:"Marler Stern",   lat:51.6571, lon:7.0908 },
      { name:"Hbf Marl-Sinsen",lat:51.6772, lon:7.1450 },
    ] },
  { id:"hattingen", name:"Hattingen", searchArea:"Hattingen, Germany",
    streets:[
      { name:"Altstadt",   lat:51.3994, lon:7.1857 },
      { name:"Hbf Hattingen",lat:51.4042, lon:7.1696 },
    ] },
  { id:"castrop", name:"Castrop-Rauxel", searchArea:"Castrop-Rauxel, Germany",
    streets:[
      { name:"Stadtmitte",     lat:51.5503, lon:7.3107 },
      { name:"Hbf Castrop Süd",lat:51.5379, lon:7.3094 },
    ] },
  { id:"unna", name:"Unna", searchArea:"Unna, Germany",
    streets:[
      { name:"Altstadt / Markt",   lat:51.5365, lon:7.6890 },
      { name:"Hbf Unna",           lat:51.5346, lon:7.6968 },
    ] },
];

const AIRPORTS = [
  { code:"DUS", name:"Düsseldorf",    affectedCities:["duesseldorf","duisburg","oberhausen","muelheim"] },
  { code:"DTM", name:"Dortmund",      affectedCities:["dortmund","unna","castrop","hagen"] },
  { code:"CGN", name:"Köln/Bonn",     affectedCities:["duesseldorf"] },
];

const prevLevels = {};
const recentFlights = {};

// ─── TOMTOM ──────────────────────────────────────────────────────────────────
async function fetchTraffic(lat, lon) {
  try {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&unit=KMPH&key=${TOMTOM_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const seg = d.flowSegmentData;
    if (!seg) return null;
    return { current: seg.currentSpeed, free: seg.freeFlowSpeed, ratio: seg.currentSpeed / seg.freeFlowSpeed };
  } catch { return null; }
}

async function fetchWeather(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation&timezone=Europe%2FBerlin`);
    const d = await r.json();
    return { rain: d.current.precipitation > 0.2, mm: d.current.precipitation };
  } catch { return { rain: false, mm: 0 }; }
}

async function fetchArrivals(airportCode) {
  const now = new Date();
  const past = new Date(now.getTime() - 60*60*1000);
  const fmt = (d) => d.toISOString().slice(0,16);
  const url = `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${airportCode}/${fmt(past)}/${fmt(now)}?direction=Arrival&withCancelled=false`;
  const r = await fetch(url, {
    headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" },
  });
  if (!r.ok) throw new Error(`AeroDataBox ${r.status}`);
  const d = await r.json();
  return (d.arrivals || []).map(f => ({
    flight: f.number || "?",
    origin: f.movement?.airport?.name || "?",
  }));
}

async function scanCityStreets(city) {
  const results = [];
  let totalRatio = 0, count = 0;
  for (const st of city.streets) {
    const tf = await fetchTraffic(st.lat, st.lon);
    if (tf) {
      totalRatio += tf.ratio;
      count++;
      let status = "FREE";
      if (tf.ratio < 0.4) status = "JAM";
      else if (tf.ratio < 0.6) status = "SLOW";
      else if (tf.ratio < 0.85) status = "MODERATE";
      results.push({ name: st.name, speed: Math.round(tf.current), pct: Math.round(tf.ratio*100), status });
    }
  }
  const weather = await fetchWeather(city.streets[0].lat, city.streets[0].lon);
  const avgRatio = count > 0 ? totalRatio / count : 1;
  let score = 3;
  if (avgRatio < 0.4) score += 4;
  else if (avgRatio < 0.6) score += 3;
  else if (avgRatio < 0.85) score += 1;
  if (weather.rain) score += 1;
  const hour = new Date().getHours(), day = new Date().getDay();
  if ((day === 5 || day === 6) && (hour >= 22 || hour < 4)) score += 2;
  else if ((day === 5 || day === 6) && hour >= 18) score += 1;
  else if (hour >= 17 && hour <= 19) score += 1;
  for (const ap of AIRPORTS) {
    if (ap.affectedCities.includes(city.id)) {
      const flights = recentFlights[ap.code] || [];
      if (flights.length >= 5) score += 2;
      else if (flights.length >= 2) score += 1;
    }
  }
  score = Math.min(10, Math.max(1, score));
  const level = score >= 8 ? "CRITICAL" : score >= 6 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW";
  results.sort((a,b) => a.pct - b.pct);
  return { score, level, streets: results, weather, avgRatio: Math.round(avgRatio*100) };
}

async function trafficScan() {
  for (const city of CITIES) {
    try {
      const data = await scanCityStreets(city);
      const isHigh = data.level === "HIGH" || data.level === "CRITICAL";
      const wasLow = !prevLevels[city.id] || prevLevels[city.id] === "LOW" || prevLevels[city.id] === "MEDIUM";
      if (isHigh && wasLow) {
        const icon = data.level === "CRITICAL" ? "🔴" : "🟠";
        const jams = data.streets.filter(r => r.status === "JAM" || r.status === "SLOW").slice(0,4)
                     .map(r => `  📍 ${r.name} — ${r.speed}km/h (${r.pct}%)`).join("\n");
        const rain = data.weather.rain ? `\n🌧 مطر: ${data.weather.mm}mm` : "";
        await bot.sendMessage(CHAT_ID, `${icon} *${city.name} — ${data.level} (${data.score}/10)*\n🚦 Flow: ${data.avgRatio}%${rain}\n\n${jams || "_لا شوارع مزدحمة_"}`, { parse_mode:"Markdown" });
      }
      prevLevels[city.id] = data.level;
    } catch(e) { console.error(`${city.name}: ${e.message}`); }
  }
}

async function flightScan() {
  for (const ap of AIRPORTS) {
    try {
      const flights = await fetchArrivals(ap.code);
      recentFlights[ap.code] = flights;
      if (flights.length >= 3) {
        const cityNames = ap.affectedCities.map(id => CITIES.find(c => c.id === id)?.name).filter(Boolean).join(", ");
        const list = flights.slice(0,5).map(f => `  ✈️ ${f.flight} ${f.origin}`).join("\n");
        await bot.sendMessage(CHAT_ID, `🛬 *${ap.name} (${ap.code})* — ${flights.length} طيارات هبطت\n\n${list}\n\n🚗 ضغط متوقع بعد 30-45 د:\n_${cityNames}_`, { parse_mode:"Markdown" });
      }
    } catch(e) { console.error(`${ap.code}: ${e.message}`); }
  }
}

// ─── APIFY ───────────────────────────────────────────────────────────────────
async function runApifyScrape(searchArea, categories, maxPlaces = 5) {
  const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchStringsArray: categories, locationQuery: searchArea,
      maxCrawledPlacesPerSearch: maxPlaces, language: "en",
      scrapePlaceDetailPage: true, scrapePopularTimesInsights: true,
    }),
  });
  if (!r.ok) throw new Error(`Apify ${r.status}`);
  return await r.json();
}

async function scrapeOneCity(city, chatId) {
  const items = await runApifyScrape(city.searchArea, ["bar","club","restaurant"], 5);
  if (!items?.length) { await bot.sendMessage(chatId, `*${city.name}*: ما في أماكن.`, { parse_mode:"Markdown" }); return; }
  const sorted = items.map(p => ({
    name: p.title, category: p.categoryName || "",
    livePct: p.popularTimesLivePercent || null,
    rating: p.totalScore,
  })).sort((a,b) => (b.livePct||0) - (a.livePct||0));
  let text = `👥 *${city.name}:*\n\n`;
  for (const p of sorted.slice(0,6)) {
    if (p.livePct) {
      const bar = "█".repeat(Math.round(p.livePct/10)) + "░".repeat(10 - Math.round(p.livePct/10));
      text += `📍 *${p.name}*\n   ${p.category}\n   ${bar} ${p.livePct}%\n\n`;
    } else {
      text += `📍 *${p.name}*\n   ${p.category}${p.rating ? ` · ⭐ ${p.rating}` : ""}\n\n`;
    }
  }
  await bot.sendMessage(chatId, text, { parse_mode:"Markdown" });
}

// ─── ARABIC COMMANDS — FINANCE ────────────────────────────────────────────────

// سلام / كاوا — تسجيل تقرير
async function handleDriverReport(msg, driver) {
  const text = msg.text;
  const data = loadData();
  const parsed = parseReport(text);

  if (parsed.gesamt === 0) {
    await bot.sendMessage(msg.chat.id,
      `❌ ما قدرت أقرأ التقرير.\nأرسل التقرير بهذا الشكل:\n\n*${driver}*\n6 Apr – 13 Apr\nFahrten: 112\nNetto-Fahrpreis: 1.181,61 €\nAktionen: 370,00 €\nTrinkgeld: 36,62 €\nGesamtumsätze: 1.588,23 €\nEingenommenes Bargeld: -704,99 €`,
      { parse_mode:"Markdown" });
    return;
  }

  data[driver].push(parsed);
  saveData(data);

  await bot.sendMessage(msg.chat.id,
    `✅ تم تسجيل تقرير *${driver}*\n\n` +
    `📅 ${parsed.period}\n` +
    `🚗 رحلات: ${parsed.fahrten}\n` +
    `💰 Netto: ${fmt(parsed.netto)}\n` +
    `🎯 Aktionen: ${fmt(parsed.aktionen)}\n` +
    `💝 Trinkgeld: ${fmt(parsed.trinkgeld)}\n` +
    `📊 الإجمالي: ${fmt(parsed.gesamt)}\n` +
    `💵 كاش مستلم: ${fmt(parsed.bargeld)}`,
    { parse_mode:"Markdown" });
}

// مصاريف
async function handleExpense(msg, type, label) {
  const text = msg.text;
  const m = text.match(/([\d.,]+)/);
  if (!m) {
    await bot.sendMessage(msg.chat.id, `❌ مثال: \`${type} 60\``, { parse_mode:"Markdown" });
    return;
  }
  const amount = smartParseNumber(m[1]);
  const data = loadData();
  data.expenses.push({
    type, amount, date: new Date().toISOString(),
  });
  saveData(data);
  await bot.sendMessage(msg.chat.id, `✅ تم تسجيل ${label}: ${fmt(amount)}`);
}

// تقرير
async function handleReport(msg) {
  const data = loadData();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Filter this month only
  const salam = data.salam.filter(r => r.addedAt >= monthStart);
  const kawa  = data.kawa.filter(r => r.addedAt >= monthStart);
  const expenses = data.expenses.filter(e => e.date >= monthStart);

  // Sum totals
  const sumDriver = (arr) => arr.reduce((s, r) => ({
    netto: s.netto + r.netto,
    aktionen: s.aktionen + r.aktionen,
    trinkgeld: s.trinkgeld + r.trinkgeld,
    gesamt: s.gesamt + r.gesamt,
    fahrten: s.fahrten + r.fahrten,
  }), { netto:0, aktionen:0, trinkgeld:0, gesamt:0, fahrten:0 });

  const S = sumDriver(salam);
  const K = sumDriver(kawa);

  // ─── حساب سلام (صاحب الشغل) ──
  const salamTaxBase = S.netto + S.aktionen;
  const salamTax = salamTaxBase * TAX_RATE;
  const salamNet = S.gesamt - salamTax;

  // ─── حساب كاوا ──
  const kawaShare    = K.gesamt * KAWA_SHARE;
  const ownerFromKawa = K.gesamt - kawaShare; // 60%
  const kawaTaxBase   = K.netto + K.aktionen;
  const kawaTax       = kawaTaxBase * TAX_RATE;
  const ownerFromKawaNet = ownerFromKawa - kawaTax;

  // ─── المصاريف ──
  const expByType = expenses.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + e.amount;
    return acc;
  }, {});
  const fuel = expByType.fuel || 0;
  const repair = expByType.repair || 0;
  const wash = expByType.wash || 0;
  const totalExp = FIXED_COMPANY + FIXED_INSURANCE + fuel + repair + wash;

  const grossOwner = salamNet + ownerFromKawaNet;
  const netOwner = grossOwner - totalExp;

  const monthName = now.toLocaleDateString("de-DE", { month:"long", year:"numeric" });

  let text = `📊 *تقرير ${monthName}*\n\n`;
  text += `━━━━━━━━━━━━━━━━━\n`;
  text += `👤 *سلام* (${S.fahrten} رحلة)\n`;
  text += `  Netto: ${fmt(S.netto)}\n`;
  text += `  Aktionen: ${fmt(S.aktionen)}\n`;
  text += `  Trinkgeld: ${fmt(S.trinkgeld)}\n`;
  text += `  الإجمالي: ${fmt(S.gesamt)}\n`;
  text += `  الضريبة 16%: -${fmt(salamTax)}\n`;
  text += `  ✅ صافي: *${fmt(salamNet)}*\n\n`;

  text += `👤 *كاوا* (${K.fahrten} رحلة)\n`;
  text += `  الإجمالي: ${fmt(K.gesamt)}\n`;
  text += `  حصة كاوا 40%: ${fmt(kawaShare)}\n`;
  text += `  حصتك 60%: ${fmt(ownerFromKawa)}\n`;
  text += `  الضريبة 16%: -${fmt(kawaTax)}\n`;
  text += `  ✅ صافي لك: *${fmt(ownerFromKawaNet)}*\n\n`;

  text += `━━━━━━━━━━━━━━━━━\n`;
  text += `💸 *المصاريف*\n`;
  text += `  شركة: ${fmt(FIXED_COMPANY)}\n`;
  text += `  تأمين: ${fmt(FIXED_INSURANCE)}\n`;
  text += `  بنزين: ${fmt(fuel)}\n`;
  text += `  تصليح: ${fmt(repair)}\n`;
  text += `  غسيل: ${fmt(wash)}\n`;
  text += `  المجموع: *${fmt(totalExp)}*\n\n`;

  text += `━━━━━━━━━━━━━━━━━\n`;
  text += `💰 *النتيجة النهائية*\n`;
  text += `  دخلك: ${fmt(grossOwner)}\n`;
  text += `  المصاريف: -${fmt(totalExp)}\n`;
  text += `  ════════════════\n`;
  text += `  ✅ ربحك الصافي: *${fmt(netOwner)}*\n`;
  text += `  💵 لكاوا: *${fmt(kawaShare)}*\n`;

  await bot.sendMessage(msg.chat.id, text, { parse_mode:"Markdown" });
}

// مسح البيانات
async function handleReset(msg) {
  saveData({ salam:[], kawa:[], expenses:[] });
  await bot.sendMessage(msg.chat.id, "✅ تم مسح كل البيانات.");
}

// ─── COMMANDS — ROUTING ──────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  if (!msg.text) return;
  const text = msg.text.trim();
  const lower = text.toLowerCase();

  // ── Arabic finance commands (check FIRST as text starts) ──
  if (text.startsWith("سلام")) return handleDriverReport(msg, "salam");
  if (text.startsWith("كاوا")) return handleDriverReport(msg, "kawa");
  if (text.startsWith("بنزين"))  return handleExpense(msg, "fuel",   "بنزين");
  if (text.startsWith("تصليح"))  return handleExpense(msg, "repair", "تصليح");
  if (text.startsWith("غسيل"))   return handleExpense(msg, "wash",   "غسيل");
  if (text === "تقرير")          return handleReport(msg);
  if (text === "مسح البيانات")  return handleReset(msg);
  if (text === "مساعدة" || text === "/help") {
    await bot.sendMessage(msg.chat.id,
      `📋 *الأوامر العربية (مالية)*\n\n` +
      `*سلام* — تسجيل دخلك (الصق التقرير بعد الكلمة)\n` +
      `*كاوا* — تسجيل دخل كاوا\n` +
      `*بنزين 60* — فاتورة بنزين\n` +
      `*تصليح 250* — فاتورة تصليح\n` +
      `*غسيل 15* — فاتورة غسيل\n` +
      `*تقرير* — التقرير الشهري الكامل\n` +
      `*مسح البيانات* — يمسح كل شي\n\n` +
      `📋 *English (traffic & info)*\n` +
      `/start /status /scan /flights /crowds /cities`,
      { parse_mode:"Markdown" });
    return;
  }
});

// ─── ENGLISH BOT COMMANDS ────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "👋 *NRW Surge Bot v6*\n\n" +
    "🤖 *تلقائي:*\n" +
    "🚦 زحمة كل 3 دقائق\n" +
    "🛬 طيارات كل ساعتين\n\n" +
    "📋 *الأوامر العربية:*\n" +
    "أرسل *مساعدة* للقائمة الكاملة\n\n" +
    "📋 *English commands:*\n" +
    "/status — current state\n" +
    "/scan <city> — scan one city\n" +
    "/flights — recent arrivals\n" +
    "/crowds <city> — busy places\n" +
    "/cities — list city IDs",
    { parse_mode:"Markdown" });
});

bot.onText(/\/cities/, async (msg) => {
  await bot.sendMessage(msg.chat.id, `*Cities:*\n${CITIES.map(c => `• \`${c.id}\` — ${c.name}`).join("\n")}`, { parse_mode:"Markdown" });
});

bot.onText(/\/status/, async (msg) => {
  let text = "📊 *الحالة الحالية:*\n\n";
  const sorted = CITIES.map(c => ({ name:c.name, level:prevLevels[c.id] || "UNKNOWN" }))
                       .sort((a,b) => ({CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,UNKNOWN:0})[b.level] - ({CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,UNKNOWN:0})[a.level]);
  for (const c of sorted) {
    const i = c.level === "CRITICAL" ? "🔴" : c.level === "HIGH" ? "🟠" : c.level === "MEDIUM" ? "🟡" : c.level === "LOW" ? "🟢" : "⚪";
    text += `${i} ${c.name} — ${c.level}\n`;
  }
  await bot.sendMessage(msg.chat.id, text, { parse_mode:"Markdown" });
});

bot.onText(/\/scan(?:\s+(\w+))?/, async (msg, match) => {
  const arg = match[1]?.toLowerCase();
  if (!arg) { await bot.sendMessage(msg.chat.id, "Usage: `/scan bochum` or `/scan all`", { parse_mode:"Markdown" }); return; }
  if (arg === "all") { await bot.sendMessage(msg.chat.id, "⟳ Scanning..."); await trafficScan(); return; }
  const city = CITIES.find(c => c.id === arg);
  if (!city) { await bot.sendMessage(msg.chat.id, `❌ Unknown: ${arg}`); return; }
  await bot.sendMessage(msg.chat.id, `⟳ Scanning *${city.name}*...`, { parse_mode:"Markdown" });
  try {
    const d = await scanCityStreets(city);
    const icon = d.level === "CRITICAL" ? "🔴" : d.level === "HIGH" ? "🟠" : d.level === "MEDIUM" ? "🟡" : "🟢";
    let text = `${icon} *${city.name} — ${d.level} (${d.score}/10)*\n🚦 Flow: ${d.avgRatio}%`;
    if (d.weather.rain) text += `\n🌧 مطر: ${d.weather.mm}mm`;
    text += `\n\n*الشوارع:*\n`;
    for (const s of d.streets) {
      const si = s.status === "JAM" ? "🔴" : s.status === "SLOW" ? "🟠" : s.status === "MODERATE" ? "🟡" : "🟢";
      text += `${si} ${s.name} — ${s.speed}km/h (${s.pct}%)\n`;
    }
    await bot.sendMessage(msg.chat.id, text, { parse_mode:"Markdown" });
  } catch(e) { await bot.sendMessage(msg.chat.id, `❌ ${e.message}`); }
});

bot.onText(/\/flights/, async (msg) => {
  await bot.sendMessage(msg.chat.id, "⟳ Checking arrivals...");
  await flightScan();
  let text = "✈️ *Recent arrivals:*\n\n";
  for (const ap of AIRPORTS) {
    const f = recentFlights[ap.code] || [];
    text += `*${ap.name} (${ap.code})*: ${f.length} flights\n`;
    for (const fl of f.slice(0,5)) text += `  ✈️ ${fl.flight} ${fl.origin}\n`;
    text += "\n";
  }
  await bot.sendMessage(msg.chat.id, text, { parse_mode:"Markdown" });
});

bot.onText(/\/crowds(?:\s+(\w+))?/, async (msg, match) => {
  const arg = match[1]?.toLowerCase();
  if (!arg) { await bot.sendMessage(msg.chat.id, "Usage: `/crowds bochum` or `/crowds all`", { parse_mode:"Markdown" }); return; }
  if (arg === "all") {
    await bot.sendMessage(msg.chat.id, `⟳ Scraping all (~$${(CITIES.length*0.02).toFixed(2)})...`);
    for (const city of CITIES) {
      try { await bot.sendMessage(msg.chat.id, `⟳ ${city.name}...`); await scrapeOneCity(city, msg.chat.id); }
      catch(e) { await bot.sendMessage(msg.chat.id, `❌ ${city.name}: ${e.message}`); }
    }
    return;
  }
  const city = CITIES.find(c => c.id === arg);
  if (!city) { await bot.sendMessage(msg.chat.id, `❌ Unknown: ${arg}`); return; }
  await bot.sendMessage(msg.chat.id, `⟳ Scraping *${city.name}*...`, { parse_mode:"Markdown" });
  try { await scrapeOneCity(city, msg.chat.id); }
  catch(e) { await bot.sendMessage(msg.chat.id, `❌ ${e.message}`); }
});

// ─── START ───────────────────────────────────────────────────────────────────
console.log("NRW Surge Bot v6 started.");
bot.sendMessage(CHAT_ID,
  `✅ *NRW Surge Bot v6*\n${CITIES.length} مدينة · ${AIRPORTS.length} مطارات\n\n💼 *الميزة الجديدة:* تسجيل الدخل والمصاريف\n\nأرسل *مساعدة* للأوامر`,
  { parse_mode:"Markdown" });

trafficScan();
flightScan();
setInterval(trafficScan, TRAFFIC_INTERVAL);
setInterval(flightScan, FLIGHT_INTERVAL);
