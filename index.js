const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TOMTOM_KEY     = process.env.TOMTOM_KEY;
const APIFY_TOKEN    = process.env.APIFY_TOKEN;
const CHAT_ID        = process.env.CHAT_ID;

const TRAFFIC_INTERVAL = 3 * 60 * 1000; // 3 min

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ─── CITIES ──────────────────────────────────────────────────────────────────
const CITIES = [
  { id:"herne", name:"Herne",
    points:[{name:"Hbf Herne",lat:51.5393,lon:7.2261},{name:"Wanne-Eickel",lat:51.5327,lon:7.1656}],
    searchArea:"Herne, Germany" },

  { id:"bochum", name:"Bochum",
    points:[{name:"Bermudadreieck",lat:51.4813,lon:7.2196},{name:"Wattenscheid",lat:51.4826,lon:7.1356},{name:"Hbf",lat:51.4787,lon:7.2234}],
    searchArea:"Bochum, Germany" },

  { id:"gelsenkirchen", name:"Gelsenkirchen",
    points:[{name:"Veltins-Arena",lat:51.554,lon:7.0679},{name:"Hbf",lat:51.5052,lon:7.1022}],
    searchArea:"Gelsenkirchen, Germany" },

  { id:"dortmund", name:"Dortmund",
    points:[{name:"Brückstraße",lat:51.5127,lon:7.4685},{name:"Hbf",lat:51.5178,lon:7.4593},{name:"Westfalenhalle",lat:51.4959,lon:7.4513}],
    searchArea:"Dortmund, Germany" },

  { id:"essen", name:"Essen",
    points:[{name:"Rüttenscheid",lat:51.4369,lon:7.0021},{name:"Hbf",lat:51.4512,lon:7.0139}],
    searchArea:"Essen, Germany" },

  { id:"recklinghausen", name:"Recklinghausen",
    points:[{name:"Altstadt",lat:51.6143,lon:7.1972}],
    searchArea:"Recklinghausen, Germany" },

  { id:"witten", name:"Witten",
    points:[{name:"Innenstadt",lat:51.4434,lon:7.335}],
    searchArea:"Witten, Germany" },

  { id:"marl", name:"Marl",
    points:[{name:"Stadtmitte",lat:51.657,lon:7.092}],
    searchArea:"Marl, Germany" },

  { id:"hattingen", name:"Hattingen",
    points:[{name:"Altstadt",lat:51.3988,lon:7.1871}],
    searchArea:"Hattingen, Germany" },

  { id:"castrop", name:"Castrop-Rauxel",
    points:[{name:"Stadtmitte",lat:51.5519,lon:7.3118}],
    searchArea:"Castrop-Rauxel, Germany" },

  { id:"duisburg", name:"Duisburg",
    points:[{name:"Altstadt",lat:51.4323,lon:6.7624},{name:"Hbf",lat:51.4314,lon:6.775}],
    searchArea:"Duisburg, Germany" },

  { id:"oberhausen", name:"Oberhausen",
    points:[{name:"CentrO",lat:51.4935,lon:6.8764}],
    searchArea:"Oberhausen, Germany" },

  { id:"duesseldorf", name:"Düsseldorf",
    points:[{name:"Altstadt",lat:51.2262,lon:6.7735},{name:"Hbf",lat:51.22,lon:6.794},{name:"Königsallee",lat:51.221,lon:6.781}],
    searchArea:"Düsseldorf, Germany" },
];

const prevLevels = {};

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

// ─── WEATHER ──────────────────────────────────────────────────────────────────
async function fetchWeather(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation&timezone=Europe%2FBerlin`);
    const d = await r.json();
    return { rain: d.current.precipitation > 0.2, mm: d.current.precipitation };
  } catch { return { rain: false, mm: 0 }; }
}

// ─── APIFY — Google Maps Scraper ──────────────────────────────────────────────
async function runApifyScrape(searchArea, categories, maxPlaces = 5) {
  const actorId = "compass~crawler-google-places";
  const input = {
    searchStringsArray: categories,
    locationQuery: searchArea,
    maxCrawledPlacesPerSearch: maxPlaces,
    language: "en",
    scrapePlaceDetailPage: true,
    scrapePopularTimesInsights: true,
  };

  // Start the run
  const startUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const r = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`Apify ${r.status}`);
  const items = await r.json();
  return items;
}

function parseBusyness(place) {
  // Try to extract current "live" popular time if present
  const live = place.popularTimesLiveText || place.popularTimesLivePercent || null;
  const hist = place.popularTimesHistogram || null;

  let livePct = null;
  if (typeof place.popularTimesLivePercent === "number") livePct = place.popularTimesLivePercent;

  // If we have histogram, find current hour percent
  if (hist && !livePct) {
    const now = new Date();
    const days = ["Su","Mo","Tu","We","Th","Fr","Sa"];
    const todayKey = days[now.getDay()];
    const hours = hist[todayKey];
    if (Array.isArray(hours)) {
      const match = hours.find(h => h.hour === now.getHours());
      if (match) livePct = match.occupancyPercent;
    }
  }

  return {
    name: place.title || place.name || "Unknown",
    address: place.address || "",
    category: place.categoryName || "",
    rating: place.totalScore || null,
    liveText: live,
    livePct,
  };
}

// ─── CITY SCAN (traffic) ──────────────────────────────────────────────────────
async function scanCity(city) {
  const results = [];
  let totalRatio = 0, count = 0;

  for (const pt of city.points) {
    const tf = await fetchTraffic(pt.lat, pt.lon);
    if (tf) {
      totalRatio += tf.ratio;
      count++;
      let status = "FREE";
      if (tf.ratio < 0.4) status = "JAM";
      else if (tf.ratio < 0.6) status = "SLOW";
      else if (tf.ratio < 0.85) status = "MODERATE";
      results.push({ name: pt.name, speed: Math.round(tf.current), pct: Math.round(tf.ratio * 100), status });
    }
  }

  const weather = await fetchWeather(city.points[0].lat, city.points[0].lon);
  const avgRatio = count > 0 ? totalRatio / count : 1;

  let score = 3;
  if (avgRatio < 0.4) score += 4;
  else if (avgRatio < 0.6) score += 3;
  else if (avgRatio < 0.85) score += 1;
  if (weather.rain) score += 1;
  if (weather.mm > 2) score += 1;

  const hour = new Date().getHours();
  const day = new Date().getDay();
  if ((day === 5 || day === 6) && (hour >= 22 || hour < 4)) score += 2;
  else if ((day === 5 || day === 6) && hour >= 18) score += 1;
  else if (hour >= 17 && hour <= 19) score += 1;

  score = Math.min(10, Math.max(1, score));
  const level = score >= 8 ? "CRITICAL" : score >= 6 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW";

  return { score, level, results, weather, avgRatio: Math.round(avgRatio * 100) };
}

// ─── AUTO TRAFFIC SCAN ────────────────────────────────────────────────────────
async function trafficScan() {
  const time = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  console.log(`[${time}] Traffic scan...`);

  for (const city of CITIES) {
    try {
      const data = await scanCity(city);
      const isHigh = data.level === "HIGH" || data.level === "CRITICAL";
      const wasLow = !prevLevels[city.id] || prevLevels[city.id] === "LOW" || prevLevels[city.id] === "MEDIUM";

      if (isHigh && wasLow) {
        const icon = data.level === "CRITICAL" ? "🔴" : "🟠";
        const jamZones = data.results.filter(r => r.status === "JAM" || r.status === "SLOW")
                          .map(r => `  📍 ${r.name} — ${r.speed}km/h (${r.pct}%)`).join("\n");
        const rain = data.weather.rain ? `\n🌧 Rain: ${data.weather.mm}mm` : "";
        const msg = `${icon} *${city.name} — ${data.level} (${data.score}/10)*\n🚦 Flow: ${data.avgRatio}%${rain}\n\n${jamZones || "No specific jam zones."}\n\nSend /crowds ${city.id} to see busy places.`;
        await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
      }

      prevLevels[city.id] = data.level;
      console.log(`  ${city.name}: ${data.level} (${data.score}/10)`);
    } catch(e) {
      console.error(`  ${city.name}: ${e.message}`);
    }
  }
}

// ─── BOT COMMANDS ─────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "👋 *NRW Surge Bot*\n\n" +
    "Auto: Traffic scan every 3 min\n\n" +
    "Commands:\n" +
    "/status — current surge state\n" +
    "/traffic — scan traffic now\n" +
    "/crowds <city> — check busy places (costs money!)\n" +
    "/cities — list city IDs\n" +
    "/help — this menu",
    { parse_mode:"Markdown" });
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "/status /traffic /cities /crowds <city>",
    { parse_mode:"Markdown" });
});

bot.onText(/\/cities/, async (msg) => {
  const list = CITIES.map(c => `• \`${c.id}\` — ${c.name}`).join("\n");
  await bot.sendMessage(msg.chat.id, `*Available city IDs:*\n\n${list}\n\nUsage: /crowds bochum`, { parse_mode:"Markdown" });
});

bot.onText(/\/traffic/, async (msg) => {
  await bot.sendMessage(msg.chat.id, "⟳ Scanning traffic...");
  await trafficScan();
  await sendStatus(msg.chat.id);
});

bot.onText(/\/status/, async (msg) => {
  await sendStatus(msg.chat.id);
});

async function sendStatus(chatId) {
  let text = "📊 *Current Surge:*\n\n";
  const sorted = CITIES
    .map(c => ({ name: c.name, id: c.id, level: prevLevels[c.id] || "UNKNOWN" }))
    .sort((a,b) => {
      const rank = { CRITICAL:4, HIGH:3, MEDIUM:2, LOW:1, UNKNOWN:0 };
      return rank[b.level] - rank[a.level];
    });
  for (const c of sorted) {
    const icon = c.level === "CRITICAL" ? "🔴" : c.level === "HIGH" ? "🟠" : c.level === "MEDIUM" ? "🟡" : c.level === "LOW" ? "🟢" : "⚪";
    text += `${icon} ${c.name} — ${c.level}\n`;
  }
  await bot.sendMessage(chatId, text, { parse_mode:"Markdown" });
}

// ─── MANUAL CROWDS — costs ~$0.02 per call ───────────────────────────────────
bot.onText(/\/crowds(?:\s+(\w+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const cityId = match[1]?.toLowerCase();

  if (!cityId) {
    await bot.sendMessage(chatId, "⚠️ Usage: /crowds <city>\nExample: `/crowds bochum`\nSee /cities for IDs.", { parse_mode:"Markdown" });
    return;
  }

  const city = CITIES.find(c => c.id === cityId);
  if (!city) {
    await bot.sendMessage(chatId, `❌ Unknown city: ${cityId}\nUse /cities to see IDs.`);
    return;
  }

  await bot.sendMessage(chatId, `⟳ Scraping popular places in *${city.name}*...\n_This costs ~$0.02 and takes 30-60 seconds._`, { parse_mode:"Markdown" });

  try {
    const categories = ["bar", "club", "restaurant"];
    const items = await runApifyScrape(city.searchArea, categories, 5);

    if (!items || items.length === 0) {
      await bot.sendMessage(chatId, "No places found. Try another city.");
      return;
    }

    const parsed = items.map(parseBusyness).filter(p => p.livePct !== null || p.liveText);
    const sorted = parsed.sort((a,b) => (b.livePct || 0) - (a.livePct || 0));

    let text = `👥 *Busy places in ${city.name} now:*\n\n`;
    if (sorted.length === 0) {
      text += "_No live popularity data available right now._\n";
      text += "Showing top-rated places:\n\n";
      for (const p of items.slice(0,5)) {
        text += `📍 *${p.title}*\n   ${p.categoryName || ""}${p.totalScore ? ` · ⭐ ${p.totalScore}` : ""}\n\n`;
      }
    } else {
      for (const p of sorted.slice(0,8)) {
        const barLen = Math.round((p.livePct || 0) / 10);
        const bar = "█".repeat(barLen) + "░".repeat(10 - barLen);
        text += `📍 *${p.name}*\n   ${p.category}\n   ${bar} ${p.livePct || 0}%${p.liveText ? ` (${p.liveText})` : ""}\n\n`;
      }
    }

    await bot.sendMessage(chatId, text, { parse_mode:"Markdown" });
  } catch(e) {
    await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
console.log("NRW Surge Bot v4 started.");
bot.sendMessage(CHAT_ID,
  "✅ *NRW Surge Bot v4*\n🚦 Auto-traffic every 3 min\n👥 Crowds on-demand only\n\nSend /start for commands.",
  { parse_mode:"Markdown" });

trafficScan();
setInterval(trafficScan, TRAFFIC_INTERVAL);
