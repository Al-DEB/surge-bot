const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const TOMTOM_KEY = process.env.TOMTOM_KEY;
const CHAT_ID = process.env.CHAT_ID;
const SCAN_INTERVAL = 3 * 60 * 1000;

const bot = new TelegramBot(TELEGRAM_TOKEN);

const CITIES = [
  { id:"herne", name:"Herne", points:[{name:"Hbf",lat:51.5393,lon:7.2261},{name:"Wanne-Eickel",lat:51.5327,lon:7.1656}] },
  { id:"bochum", name:"Bochum", points:[{name:"Bermudadreieck",lat:51.4813,lon:7.2196},{name:"Wattenscheid",lat:51.4826,lon:7.1356},{name:"Hbf",lat:51.4787,lon:7.2234}] },
  { id:"gelsenkirchen", name:"Gelsenkirchen", points:[{name:"Veltins-Arena",lat:51.554,lon:7.0679},{name:"Hbf",lat:51.5052,lon:7.1022}] },
  { id:"dortmund", name:"Dortmund", points:[{name:"Brueckstr",lat:51.5127,lon:7.4685},{name:"Hbf",lat:51.5178,lon:7.4593},{name:"Westfalenhalle",lat:51.4959,lon:7.4513}] },
  { id:"essen", name:"Essen", points:[{name:"Ruettenscheid",lat:51.4369,lon:7.0021},{name:"Hbf",lat:51.4512,lon:7.0139}] },
  { id:"recklinghausen", name:"Recklinghausen", points:[{name:"Altstadt",lat:51.6143,lon:7.1972}] },
  { id:"witten", name:"Witten", points:[{name:"Innenstadt",lat:51.4434,lon:7.335}] },
  { id:"marl", name:"Marl", points:[{name:"Stadtmitte",lat:51.657,lon:7.092}] },
  { id:"hattingen", name:"Hattingen", points:[{name:"Altstadt",lat:51.3988,lon:7.1871}] },
  { id:"castrop", name:"Castrop-Rauxel", points:[{name:"Stadtmitte",lat:51.5519,lon:7.3118}] },
  { id:"duisburg", name:"Duisburg", points:[{name:"Altstadt",lat:51.4323,lon:6.7624},{name:"Hbf",lat:51.4314,lon:6.775}] },
  { id:"oberhausen", name:"Oberhausen", points:[{name:"CentrO",lat:51.4935,lon:6.8764}] },
  { id:"duesseldorf", name:"Duesseldorf", points:[{name:"Altstadt",lat:51.2262,lon:6.7735},{name:"Hbf",lat:51.22,lon:6.794},{name:"Koenigsallee",lat:51.221,lon:6.781}] },
];

const prevLevels = {};

async function fetchTraffic(lat, lon) {
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&unit=KMPH&key=${TOMTOM_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  const seg = d.flowSegmentData;
  if (!seg) return null;
  return { current: seg.currentSpeed, free: seg.freeFlowSpeed, ratio: seg.currentSpeed / seg.freeFlowSpeed };
}

async function fetchWeather(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation&timezone=Europe%2FBerlin`);
    const d = await r.json();
    return { rain: d.current.precipitation > 0.2, mm: d.current.precipitation };
  } catch { return { rain: false, mm: 0 }; }
}

async function scanCity(city) {
  const results = [];
  let totalRatio = 0, count = 0;

  for (const pt of city.points) {
    const tf = await fetchTraffic(pt.lat, pt.lon);
    if (tf) {
      totalRatio += tf.ratio;
      count++;
      let status = "free";
      if (tf.ratio < 0.4) status = "JAM";
      else if (tf.ratio < 0.6) status = "SLOW";
      else if (tf.ratio < 0.85) status = "MODERATE";
      else status = "FREE";
      results.push({ name: pt.name, speed: Math.round(tf.current), freeSpeed: Math.round(tf.free), pct: Math.round(tf.ratio * 100), status });
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

async function scan() {
  const time = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  console.log(`[${time}] Scanning...`);

  for (const city of CITIES) {
    try {
      const data = await scanCity(city);
      const isHigh = data.level === "HIGH" || data.level === "CRITICAL";
      const wasLow = !prevLevels[city.id] || prevLevels[city.id] === "LOW" || prevLevels[city.id] === "MEDIUM";

      if (isHigh && wasLow) {
        const icon = data.level === "CRITICAL" ? "\u{1F534}" : "\u{1F7E0}";
        const zones = data.results.filter(r => r.status === "JAM" || r.status === "SLOW").map((r, i) => `  \u{1F4CD} ${r.name} — ${r.speed}km/h (${r.pct}%)`).join("\n");
        const rain = data.weather.rain ? `\n\u{1F327} Rain: ${data.weather.mm}mm` : "";
        const msg = `${icon} *${city.name} — ${data.level} (${data.score}/10)*\n\u{1F6A6} Flow: ${data.avgRatio}%${rain}\n\n${zones || "No specific jam zones."}`;
        await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
        console.log(`  Alert: ${city.name} ${data.level}`);
      }

      prevLevels[city.id] = data.level;
      console.log(`  ${city.name}: ${data.level} (${data.score}/10) flow:${data.avgRatio}%`);
    } catch (e) {
      console.error(`  ${city.name}: ${e.message}`);
    }
  }
}

console.log("NRW Surge Bot started.");
bot.sendMessage(CHAT_ID, "\u2705 *NRW Surge Bot ON*\n13 cities every 3 min.\nTomTom + Weather + Patterns.", { parse_mode: "Markdown" });
scan();
setInterval(scan, SCAN_INTERVAL);
