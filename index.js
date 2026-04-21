const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TOMTOM_KEY = process.env.TOMTOM_KEY;
const CHAT_ID = process.env.CHAT_ID;

const SCAN_INTERVAL = 10 * 60 * 1000; // 10 minutes

const bot = new TelegramBot(TELEGRAM_TOKEN);

const CITIES = [
  {
    id: "herne",
    name: "Herne",
    points: [
      { name: "Herne Hbf", lat: 51.5393, lon: 7.2261, type: "station", weight: 4 },
      { name: "Wanne-Eickel Hbf", lat: 51.5327, lon: 7.1656, type: "station", weight: 4 },
      { name: "Herne Innenstadt", lat: 51.5385, lon: 7.2244, type: "city", weight: 3 }
    ]
  },
  {
    id: "bochum",
    name: "Bochum",
    points: [
      { name: "Bermudadreieck", lat: 51.4813, lon: 7.2196, type: "nightlife", weight: 5 },
      { name: "Bochum Hbf", lat: 51.4787, lon: 7.2234, type: "station", weight: 4 },
      { name: "Ruhr Park", lat: 51.4939, lon: 7.2922, type: "shopping", weight: 4 },
      { name: "Wattenscheid", lat: 51.4826, lon: 7.1356, type: "city", weight: 3 }
    ]
  },
  {
    id: "gelsenkirchen",
    name: "Gelsenkirchen",
    points: [
      { name: "Veltins-Arena", lat: 51.554, lon: 7.0679, type: "stadium", weight: 5 },
      { name: "Gelsenkirchen Hbf", lat: 51.5052, lon: 7.1022, type: "station", weight: 4 },
      { name: "Buer", lat: 51.5807, lon: 7.0526, type: "city", weight: 3 }
    ]
  },
  {
    id: "dortmund",
    name: "Dortmund",
    points: [
      { name: "Brueckstrasse", lat: 51.5127, lon: 7.4685, type: "nightlife", weight: 5 },
      { name: "Dortmund Hbf", lat: 51.5178, lon: 7.4593, type: "station", weight: 4 },
      { name: "Westfalenhalle", lat: 51.4959, lon: 7.4513, type: "event", weight: 5 },
      { name: "Signal Iduna Park", lat: 51.4926, lon: 7.4519, type: "stadium", weight: 5 },
      { name: "Phoenix-See", lat: 51.4902, lon: 7.5115, type: "leisure", weight: 3 }
    ]
  },
  {
    id: "essen",
    name: "Essen",
    points: [
      { name: "Ruettenscheid", lat: 51.4369, lon: 7.0021, type: "nightlife", weight: 5 },
      { name: "Essen Hbf", lat: 51.4512, lon: 7.0139, type: "station", weight: 4 },
      { name: "Limbecker Platz", lat: 51.4585, lon: 7.0073, type: "shopping", weight: 4 },
      { name: "Messe Essen", lat: 51.4289, lon: 6.994, type: "event", weight: 5 }
    ]
  },
  {
    id: "recklinghausen",
    name: "Recklinghausen",
    points: [
      { name: "Altstadt", lat: 51.6143, lon: 7.1972, type: "nightlife", weight: 4 },
      { name: "Recklinghausen Hbf", lat: 51.6136, lon: 7.1976, type: "station", weight: 4 }
    ]
  },
  {
    id: "witten",
    name: "Witten",
    points: [
      { name: "Innenstadt", lat: 51.4434, lon: 7.335, type: "city", weight: 3 },
      { name: "Witten Hbf", lat: 51.4337, lon: 7.3346, type: "station", weight: 4 }
    ]
  },
  {
    id: "marl",
    name: "Marl",
    points: [
      { name: "Stadtmitte", lat: 51.657, lon: 7.092, type: "city", weight: 3 }
    ]
  },
  {
    id: "hattingen",
    name: "Hattingen",
    points: [
      { name: "Altstadt", lat: 51.3988, lon: 7.1871, type: "leisure", weight: 3 }
    ]
  },
  {
    id: "castrop",
    name: "Castrop-Rauxel",
    points: [
      { name: "Stadtmitte", lat: 51.5519, lon: 7.3118, type: "city", weight: 3 },
      { name: "Castrop Hbf", lat: 51.5586, lon: 7.3095, type: "station", weight: 4 }
    ]
  },
  {
    id: "duisburg",
    name: "Duisburg",
    points: [
      { name: "Altstadt", lat: 51.4323, lon: 6.7624, type: "nightlife", weight: 4 },
      { name: "Duisburg Hbf", lat: 51.4314, lon: 6.775, type: "station", weight: 4 },
      { name: "Innenhafen", lat: 51.4388, lon: 6.7678, type: "leisure", weight: 4 }
    ]
  },
  {
    id: "oberhausen",
    name: "Oberhausen",
    points: [
      { name: "CentrO", lat: 51.4935, lon: 6.8764, type: "shopping", weight: 5 },
      { name: "Oberhausen Hbf", lat: 51.4745, lon: 6.85, type: "station", weight: 4 }
    ]
  },
  {
    id: "duesseldorf",
    name: "Duesseldorf",
    points: [
      { name: "Altstadt", lat: 51.2262, lon: 6.7735, type: "nightlife", weight: 5 },
      { name: "Duesseldorf Hbf", lat: 51.22, lon: 6.794, type: "station", weight: 4 },
      { name: "Koenigsallee", lat: 51.221, lon: 6.781, type: "shopping", weight: 5 },
      { name: "Medienhafen", lat: 51.2165, lon: 6.7526, type: "nightlife", weight: 4 },
      { name: "Flughafen DUS", lat: 51.2895, lon: 6.7668, type: "airport", weight: 5 }
    ]
  }
];

async function fetchTraffic(lat, lon) {
  try {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&unit=KMPH&key=${TOMTOM_KEY}`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();
    const segment = data.flowSegmentData;

    if (!segment || !segment.currentSpeed || !segment.freeFlowSpeed) return null;

    return {
      current: segment.currentSpeed,
      free: segment.freeFlowSpeed,
      ratio: segment.currentSpeed / segment.freeFlowSpeed
    };
  } catch (error) {
    return null;
  }
}

async function fetchWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation&timezone=Europe%2FBerlin`;
    const response = await fetch(url);
    const data = await response.json();

    const mm = data.current && typeof data.current.precipitation === "number"
      ? data.current.precipitation
      : 0;

    return {
      rain: mm > 0.2,
      mm
    };
  } catch (error) {
    return {
      rain: false,
      mm: 0
    };
  }
}

function getLevel(score) {
  if (score >= 8) return "CRITICAL";
  if (score >= 6) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

function getTimeBonus(type) {
  const hour = new Date().getHours();
  const day = new Date().getDay(); // 0 Sunday, 5 Friday, 6 Saturday

  if (type === "nightlife") {
    if ((day === 5 || day === 6) && (hour >= 21 || hour <= 3)) return 4;
    if (hour >= 20 || hour <= 2) return 2;
  }

  if (type === "station") {
    if ((hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 19)) return 2;
    if (hour >= 22 || hour <= 1) return 1;
  }

  if (type === "shopping") {
    if (hour >= 12 && hour <= 19) return 2;
    if (hour >= 10 && hour <= 20) return 1;
  }

  if (type === "stadium" || type === "event") {
    if (hour >= 16 && hour <= 23) return 3;
    if (hour >= 12 && hour <= 15) return 1;
  }

  if (type === "airport") {
    if ((hour >= 5 && hour <= 9) || (hour >= 18 && hour <= 23)) return 3;
    return 1;
  }

  if (type === "leisure") {
    if (day === 0 || day === 6) return 2;
    if (hour >= 17 && hour <= 21) return 1;
  }

  if (type === "city") {
    if (hour >= 16 && hour <= 20) return 1;
    if ((day === 5 || day === 6) && hour >= 18) return 2;
  }

  return 0;
}

function getMapsUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
}

async function scanHotspot(city, point) {
  let score = point.weight || 3;
  const reasons = [];

  let trafficText = "No traffic data";
  const traffic = await fetchTraffic(point.lat, point.lon);

  if (traffic) {
    const flowPercent = Math.round(traffic.ratio * 100);
    trafficText = `${Math.round(traffic.current)} km/h (${flowPercent}%)`;

    if (traffic.ratio < 0.4) {
      score += 3;
      reasons.push("Strong traffic jam");
    } else if (traffic.ratio < 0.6) {
      score += 2;
      reasons.push("Slow traffic");
    } else if (traffic.ratio < 0.85) {
      score += 1;
      reasons.push("Moderate traffic");
    }
  }

  const weather = await fetchWeather(point.lat, point.lon);

  if (weather.rain) {
    score += 1;
    reasons.push(`Rain ${weather.mm} mm`);
  }

  if (weather.mm > 2) {
    score += 1;
    reasons.push("Heavy rain");
  }

  const timeBonus = getTimeBonus(point.type);

  if (timeBonus > 0) {
    score += timeBonus;
    reasons.push(`${point.type} demand time`);
  }

  const hour = new Date().getHours();
  const day = new Date().getDay();

  if ((day === 5 || day === 6) && hour >= 18) {
    score += 1;
    reasons.push("Weekend evening");
  }

  score = Math.min(10, Math.max(1, score));

  return {
    city: city.name,
    name: point.name,
    type: point.type,
    score,
    level: getLevel(score),
    traffic: trafficText,
    reasons,
    lat: point.lat,
    lon: point.lon,
    mapsUrl: getMapsUrl(point.lat, point.lon)
  };
}

async function scanAllHotspots() {
  const allHotspots = [];

  for (const city of CITIES) {
    for (const point of city.points) {
      try {
        const result = await scanHotspot(city, point);
        allHotspots.push(result);
      } catch (error) {
        console.error(`${city.name} ${point.name}: ${error.message}`);
      }
    }
  }

  allHotspots.sort((a, b) => b.score - a.score);

  return allHotspots.slice(0, 7);
}

async function sendTopHotspots() {
  const time = new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });

  console.log(`[${time}] Scanning NRW hotspots...`);

  const topHotspots = await scanAllHotspots();

  const lines = topHotspots.map((hotspot, index) => {
    const icon = hotspot.score >= 8 ? "🔥" : hotspot.score >= 6 ? "🟠" : "🟡";
    const reasonText = hotspot.reasons.length
      ? hotspot.reasons.join(" + ")
      : "Normal pattern";

    return `${index + 1}. ${icon} *${hotspot.city} — ${hotspot.name}* (${hotspot.score}/10)
Level: ${hotspot.level}
Type: ${hotspot.type}
Traffic: ${hotspot.traffic}
Reason: ${reasonText}
[Open Google Maps](${hotspot.mapsUrl})`;
  }).join("\n\n");

  const message = `🚕 *NRW Demand Hotspots Now*
Time: ${time}

${lines}`;

  await bot.sendMessage(CHAT_ID, message, {
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });

  console.log("Telegram report sent.");
}

async function startBot() {
  if (!TELEGRAM_TOKEN || !TOMTOM_KEY || !CHAT_ID) {
    console.error("Missing environment variables: TELEGRAM_TOKEN, TOMTOM_KEY, CHAT_ID");
    return;
  }

  console.log("NRW Demand Hotspot Bot started.");

  await bot.sendMessage(
    CHAT_ID,
    "✅ *NRW Demand Hotspot Bot ON*\nScanning top demand areas every 10 minutes.\nTraffic + Weather + Hotspot Patterns.",
    { parse_mode: "Markdown" }
  );

  await sendTopHotspots();

  setInterval(sendTopHotspots, SCAN_INTERVAL);
}

startBot();
