const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TOMTOM_KEY     = process.env.TOMTOM_KEY;
const APIFY_TOKEN    = process.env.APIFY_TOKEN;
const RAPIDAPI_KEY   = process.env.RAPIDAPI_KEY;
const CHAT_ID        = process.env.CHAT_ID;

const TRAFFIC_INTERVAL = 3 * 60 * 1000;       // 3 min  — TomTom (free)
const FLIGHT_INTERVAL  = 2 * 60 * 60 * 1000;  // 2 hrs  — AeroDataBox (free tier)

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ─── CITIES with detailed streets (lat/lon) ─────────────────────────────────
const CITIES = [
  { id:"bochum", name:"Bochum", searchArea:"Bochum, Germany",
    streets:[
      { name:"Castroper Str / Ruhrstadion", lat:51.4900, lon:7.2358, tag:"stadium" },
      { name:"Jahrhunderthalle",             lat:51.4863, lon:7.2089, tag:"venue" },
      { name:"Kortumstraße",                 lat:51.4815, lon:7.2188, tag:"shopping" },
      { name:"Brüderstraße / Bermudadreieck",lat:51.4810, lon:7.2196, tag:"club" },
      { name:"Viktoriastraße",               lat:51.4789, lon:7.2192, tag:"club" },
      { name:"Südring",                      lat:51.4790, lon:7.2200, tag:"road" },
      { name:"Stühmeyerstraße",              lat:51.4838, lon:7.2253, tag:"rotlicht" },
      { name:"Hbf Bochum",                   lat:51.4787, lon:7.2234, tag:"hbf" },
      { name:"Herner Straße",                lat:51.4900, lon:7.2173, tag:"road" },
      { name:"Wittener Straße",              lat:51.4793, lon:7.2390, tag:"road" },
      { name:"Universitätsstraße (RUB)",     lat:51.4470, lon:7.2657, tag:"uni" },
    ] },
  { id:"dortmund", name:"Dortmund", searchArea:"Dortmund, Germany",
    streets:[
      { name:"Strobelallee / Signal Iduna",  lat:51.4925, lon:7.4519, tag:"stadium" },
      { name:"B1 / Rheinlanddamm",           lat:51.4953, lon:7.4641, tag:"road" },
      { name:"Westfalenhalle",               lat:51.4978, lon:7.4548, tag:"venue" },
      { name:"Brückstraße",                  lat:51.5141, lon:7.4684, tag:"club" },
      { name:"Kleppingstraße",               lat:51.5142, lon:7.4669, tag:"club" },
      { name:"Kampstraße",                   lat:51.5148, lon:7.4625, tag:"shopping" },
      { name:"Hbf Dortmund",                 lat:51.5179, lon:7.4593, tag:"hbf" },
      { name:"Ruhrallee",                    lat:51.5040, lon:7.4691, tag:"road" },
      { name:"Kronprinzenstraße / Nordstadt",lat:51.5237, lon:7.4621, tag:"rotlicht" },
      { name:"Linienstraße",                 lat:51.5226, lon:7.4581, tag:"rotlicht" },
      { name:"Borsigplatz",                  lat:51.5246, lon:7.4751, tag:"area" },
    ] },
  { id:"essen", name:"Essen", searchArea:"Essen, Germany",
    streets:[
      { name:"Rüttenscheider Straße",        lat:51.4366, lon:7.0026, tag:"club" },
      { name:"Huyssenallee",                 lat:51.4474, lon:7.0152, tag:"road" },
      { name:"Hbf Essen / Freiheit",         lat:51.4512, lon:7.0139, tag:"hbf" },
      { name:"Kettwiger Straße",             lat:51.4555, lon:7.0103, tag:"shopping" },
      { name:"Viehofer Straße",              lat:51.4582, lon:7.0156, tag:"rotlicht" },
      { name:"Stauderstraße / Grugahalle",   lat:51.4376, lon:7.0179, tag:"venue" },
      { name:"Zeche Zollverein",             lat:51.4866, lon:7.0421, tag:"venue" },
      { name:"Steeler Straße",               lat:51.4505, lon:7.0431, tag:"road" },
      { name:"Messe Essen",                  lat:51.4385, lon:7.0157, tag:"venue" },
    ] },
  { id:"duisburg", name:"Duisburg", searchArea:"Duisburg, Germany",
    streets:[
      { name:"Königstraße",                  lat:51.4341, lon:6.7610, tag:"shopping" },
      { name:"Hbf Duisburg",                 lat:51.4314, lon:6.7748, tag:"hbf" },
      { name:"Innenhafen",                   lat:51.4419, lon:6.7706, tag:"area" },
      { name:"Düsseldorfer Straße",          lat:51.4255, lon:6.7681, tag:"club" },
      { name:"Schifferstraße / Hafen",       lat:51.4503, lon:6.7355, tag:"area" },
      { name:"Kalkweg / MSV Arena",          lat:51.4082, lon:6.7779, tag:"stadium" },
      { name:"Landfermannstraße",            lat:51.4338, lon:6.7637, tag:"road" },
      { name:"Neudorfer Straße",             lat:51.4269, lon:6.7836, tag:"road" },
    ] },
  { id:"duesseldorf", name:"Düsseldorf", searchArea:"Düsseldorf, Germany",
    streets:[
      { name:"Bolkerstraße / Altstadt",      lat:51.2271, lon:6.7740, tag:"club" },
      { name:"Königsallee",                  lat:51.2238, lon:6.7790, tag:"shopping" },
      { name:"Hbf Düsseldorf",               lat:51.2200, lon:6.7940, tag:"hbf" },
      { name:"Flughafen DUS",                lat:51.2895, lon:6.7668, tag:"airport" },
      { name:"Merkur Spiel-Arena",           lat:51.2614, lon:6.7333, tag:"stadium" },
      { name:"Medienhafen",                  lat:51.2169, lon:6.7559, tag:"area" },
      { name:"Charlottenstraße",             lat:51.2272, lon:6.7891, tag:"rotlicht" },
      { name:"Worringer Platz",              lat:51.2284, lon:6.7889, tag:"area" },
    ] },
  { id:"gelsenkirchen", name:"Gelsenkirchen", searchArea:"Gelsenkirchen, Germany",
    streets:[
      { name:"Veltins-Arena",                lat:51.5547, lon:7.0676, tag:"stadium" },
      { name:"Kurt-Schumacher-Straße",       lat:51.5444, lon:7.0824, tag:"road" },
      { name:"Arenastraße",                  lat:51.5530, lon:7.0703, tag:"stadium" },
      { name:"Bahnhofstraße GE",             lat:51.5071, lon:7.1015, tag:"shopping" },
      { name:"Hbf Gelsenkirchen",            lat:51.5052, lon:7.1022, tag:"hbf" },
      { name:"Buer / Hochstraße",            lat:51.5778, lon:7.0589, tag:"area" },
    ] },
  { id:"oberhausen", name:"Oberhausen", searchArea:"Oberhausen, Germany",
    streets:[
      { name:"CentrO / Centroallee",         lat:51.4943, lon:6.8762, tag:"shopping" },
      { name:"König-Pilsener-Arena",         lat:51.4926, lon:6.8772, tag:"venue" },
      { name:"Marktstraße",                  lat:51.4716, lon:6.8525, tag:"shopping" },
      { name:"Hbf Oberhausen",               lat:51.4736, lon:6.8519, tag:"hbf" },
      { name:"Mülheimer Straße",             lat:51.4661, lon:6.8546, tag:"road" },
      { name:"Sterkrader Tor",               lat:51.5149, lon:6.8584, tag:"area" },
    ] },
  { id:"muelheim", name:"Mülheim", searchArea:"Mülheim an der Ruhr, Germany",
    streets:[
      { name:"Hbf Mülheim / Friedrichstr",   lat:51.4314, lon:6.8830, tag:"hbf" },
      { name:"Schloßstraße",                 lat:51.4305, lon:6.8855, tag:"shopping" },
      { name:"Leineweberstraße",             lat:51.4279, lon:6.8773, tag:"road" },
      { name:"Ruhrpromenade",                lat:51.4314, lon:6.8763, tag:"area" },
      { name:"Forum City Mülheim",           lat:51.4288, lon:6.8853, tag:"shopping" },
    ] },
  { id:"hagen", name:"Hagen", searchArea:"Hagen, Germany",
    streets:[
      { name:"Hbf Hagen / Berliner Platz",   lat:51.3667, lon:7.4624, tag:"hbf" },
      { name:"Elberfelder Straße",           lat:51.3613, lon:7.4715, tag:"shopping" },
      { name:"Bahnhofstraße",                lat:51.3635, lon:7.4682, tag:"road" },
      { name:"Körnerstraße",                 lat:51.3604, lon:7.4754, tag:"road" },
      { name:"ENERVIE Arena",                lat:51.3526, lon:7.4628, tag:"venue" },
    ] },
  { id:"wuppertal", name:"Wuppertal", searchArea:"Wuppertal, Germany",
    streets:[
      { name:"Hbf Wuppertal / Döppersberg",  lat:51.2549, lon:7.1495, tag:"hbf" },
      { name:"Friedrich-Engels-Allee",       lat:51.2563, lon:7.1532, tag:"road" },
      { name:"Luisenstraße",                 lat:51.2586, lon:7.1438, tag:"club" },
      { name:"Schwebebahn Hauptstraße",      lat:51.2553, lon:7.1505, tag:"road" },
      { name:"Historische Stadthalle",       lat:51.2522, lon:7.1499, tag:"venue" },
      { name:"Kipdorf",                      lat:51.2575, lon:7.1500, tag:"rotlicht" },
    ] },
  { id:"herne", name:"Herne", searchArea:"Herne, Germany",
    streets:[
      { name:"Hbf Herne / Bahnhofstraße",    lat:51.5393, lon:7.2261, tag:"hbf" },
      { name:"Wanne-Eickel Hbf",             lat:51.5316, lon:7.1635, tag:"hbf" },
      { name:"Cranger Kirmes (saisonal)",    lat:51.5364, lon:7.1503, tag:"event" },
      { name:"Bahnhofstraße Wanne",          lat:51.5323, lon:7.1643, tag:"shopping" },
      { name:"Herner Rathaus",               lat:51.5378, lon:7.2237, tag:"area" },
    ] },
  { id:"recklinghausen", name:"Recklinghausen", searchArea:"Recklinghausen, Germany",
    streets:[
      { name:"Hbf Recklinghausen",           lat:51.6135, lon:7.1815, tag:"hbf" },
      { name:"Altstadt / Kunibertistr",      lat:51.6147, lon:7.1972, tag:"shopping" },
      { name:"Ruhrfestspielhaus",            lat:51.6280, lon:7.1975, tag:"venue" },
      { name:"Herzogswall",                  lat:51.6149, lon:7.1957, tag:"road" },
      { name:"Bochumer Straße",              lat:51.6071, lon:7.1944, tag:"road" },
    ] },
  { id:"witten", name:"Witten", searchArea:"Witten, Germany",
    streets:[
      { name:"Hbf Witten",                   lat:51.4387, lon:7.3327, tag:"hbf" },
      { name:"Ruhrstraße",                   lat:51.4438, lon:7.3349, tag:"shopping" },
      { name:"Bahnhofstraße",                lat:51.4407, lon:7.3338, tag:"road" },
      { name:"Stadtgalerie",                 lat:51.4427, lon:7.3343, tag:"shopping" },
      { name:"Universität Witten/Herdecke",  lat:51.4429, lon:7.3517, tag:"uni" },
    ] },
  { id:"marl", name:"Marl", searchArea:"Marl, Germany",
    streets:[
      { name:"Marler Stern",                 lat:51.6571, lon:7.0908, tag:"shopping" },
      { name:"Hbf Marl-Sinsen",              lat:51.6772, lon:7.1450, tag:"hbf" },
      { name:"Creiler Platz",                lat:51.6571, lon:7.0902, tag:"area" },
      { name:"Chemiepark Marl",              lat:51.6831, lon:7.1228, tag:"area" },
    ] },
  { id:"hattingen", name:"Hattingen", searchArea:"Hattingen, Germany",
    streets:[
      { name:"Altstadt / Kirchplatz",        lat:51.3994, lon:7.1857, tag:"shopping" },
      { name:"Hbf Hattingen",                lat:51.4042, lon:7.1696, tag:"hbf" },
      { name:"Heggerstraße",                 lat:51.3989, lon:7.1854, tag:"shopping" },
      { name:"Nierenhof",                    lat:51.3712, lon:7.1638, tag:"area" },
    ] },
  { id:"castrop", name:"Castrop-Rauxel", searchArea:"Castrop-Rauxel, Germany",
    streets:[
      { name:"Stadtmitte / Münsterplatz",    lat:51.5503, lon:7.3107, tag:"shopping" },
      { name:"Hbf Castrop-Rauxel Süd",       lat:51.5379, lon:7.3094, tag:"hbf" },
      { name:"Europaplatz",                  lat:51.5498, lon:7.3122, tag:"area" },
      { name:"Wittener Straße",              lat:51.5410, lon:7.3155, tag:"road" },
    ] },
  { id:"unna", name:"Unna", searchArea:"Unna, Germany",
    streets:[
      { name:"Altstadt / Markt",             lat:51.5365, lon:7.6890, tag:"shopping" },
      { name:"Hbf Unna",                     lat:51.5346, lon:7.6968, tag:"hbf" },
      { name:"Massener Straße",              lat:51.5380, lon:7.6829, tag:"road" },
      { name:"Lindenplatz",                  lat:51.5366, lon:7.6907, tag:"area" },
    ] },
];

// ─── AIRPORTS ────────────────────────────────────────────────────────────────
const AIRPORTS = [
  { code:"DUS", name:"Düsseldorf",    affectedCities:["duesseldorf","duisburg","oberhausen","muelheim"] },
  { code:"DTM", name:"Dortmund",      affectedCities:["dortmund","unna","castrop","hagen"] },
  { code:"CGN", name:"Köln/Bonn",     affectedCities:["duesseldorf"] },
];

// ─── STATE ───────────────────────────────────────────────────────────────────
const prevLevels = {};
const recentFlights = {}; // airport.code -> [{flight, origin, time}]

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

// ─── WEATHER ─────────────────────────────────────────────────────────────────
async function fetchWeather(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation&timezone=Europe%2FBerlin`);
    const d = await r.json();
    return { rain: d.current.precipitation > 0.2, mm: d.current.precipitation };
  } catch { return { rain: false, mm: 0 }; }
}

// ─── AERODATABOX — FLIGHT ARRIVALS ───────────────────────────────────────────
async function fetchArrivals(airportCode) {
  // get arrivals in the last 60 min
  const now = new Date();
  const past = new Date(now.getTime() - 60*60*1000);
  const fmt = (d) => d.toISOString().slice(0,16); // YYYY-MM-DDTHH:MM
  const url = `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${airportCode}/${fmt(past)}/${fmt(now)}?withLeg=true&direction=Arrival&withCancelled=false&withCodeshared=false&withCargo=false&withPrivate=false`;

  const r = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": RAPIDAPI_KEY,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
  });
  if (!r.ok) throw new Error(`AeroDataBox ${r.status}`);
  const d = await r.json();
  return (d.arrivals || []).map(f => ({
    flight: f.number || "?",
    origin: f.movement?.airport?.name || "?",
    time: f.movement?.actualTime?.local || f.movement?.scheduledTime?.local || "",
    status: f.status || "",
  }));
}

// ─── STREET SCAN ─────────────────────────────────────────────────────────────
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
      results.push({
        name: st.name, tag: st.tag,
        speed: Math.round(tf.current),
        free: Math.round(tf.free),
        pct: Math.round(tf.ratio * 100),
        status
      });
    }
  }

  const weather = await fetchWeather(city.streets[0].lat, city.streets[0].lon);
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

  // Airport boost — recent flights to this city's airport area
  for (const ap of AIRPORTS) {
    if (ap.affectedCities.includes(city.id)) {
      const flights = recentFlights[ap.code] || [];
      if (flights.length >= 5) score += 2;
      else if (flights.length >= 2) score += 1;
    }
  }

  score = Math.min(10, Math.max(1, score));
  const level = score >= 8 ? "CRITICAL" : score >= 6 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW";

  // Sort streets — worst first
  results.sort((a,b) => a.pct - b.pct);

  return { score, level, streets: results, weather, avgRatio: Math.round(avgRatio * 100) };
}

// ─── AUTO TRAFFIC SCAN ───────────────────────────────────────────────────────
async function trafficScan() {
  const time = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  console.log(`[${time}] Traffic scan...`);

  for (const city of CITIES) {
    try {
      const data = await scanCityStreets(city);
      const isHigh = data.level === "HIGH" || data.level === "CRITICAL";
      const wasLow = !prevLevels[city.id] || prevLevels[city.id] === "LOW" || prevLevels[city.id] === "MEDIUM";

      if (isHigh && wasLow) {
        const icon = data.level === "CRITICAL" ? "🔴" : "🟠";
        const jamStreets = data.streets.filter(r => r.status === "JAM" || r.status === "SLOW")
                           .slice(0,4)
                           .map(r => `  📍 ${r.name} — ${r.speed}km/h (${r.pct}%)`).join("\n");
        const rain = data.weather.rain ? `\n🌧 Rain: ${data.weather.mm}mm` : "";
        const msg = `${icon} *${city.name} — ${data.level} (${data.score}/10)*\n🚦 Flow: ${data.avgRatio}%${rain}\n\n${jamStreets || "_No jammed streets._"}`;
        await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
      }

      prevLevels[city.id] = data.level;
      console.log(`  ${city.name}: ${data.level} (${data.score}/10)`);
    } catch(e) {
      console.error(`  ${city.name}: ${e.message}`);
    }
  }
}

// ─── AUTO FLIGHT SCAN ────────────────────────────────────────────────────────
async function flightScan() {
  const time = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  console.log(`[${time}] Flight scan...`);

  for (const ap of AIRPORTS) {
    try {
      const flights = await fetchArrivals(ap.code);
      recentFlights[ap.code] = flights;
      console.log(`  ${ap.code}: ${flights.length} arrivals (last 60 min)`);

      // Alert if 3+ flights landed recently
      if (flights.length >= 3) {
        const cityNames = ap.affectedCities.map(id => CITIES.find(c => c.id === id)?.name || id).filter(Boolean).join(", ");
        const list = flights.slice(0,5).map(f => `  ✈️ ${f.flight} ${f.origin}`).join("\n");
        const msg = `🛬 *${ap.name} (${ap.code})* — ${flights.length} طيارات هبطت\n\n${list}\n\n🚗 Demand expected in 30-45 min:\n_${cityNames}_`;
        await bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
      }
    } catch(e) {
      console.error(`  ${ap.code}: ${e.message}`);
    }
  }
}

// ─── APIFY (manual crowds) ───────────────────────────────────────────────────
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
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`Apify ${r.status}`);
  return await r.json();
}

function parseBusy(p) {
  let pct = null;
  if (typeof p.popularTimesLivePercent === "number") pct = p.popularTimesLivePercent;
  return {
    name: p.title || p.name || "?",
    category: p.categoryName || "",
    livePct: pct,
    liveText: p.popularTimesLiveText || null,
    rating: p.totalScore || null,
  };
}

async function scrapeOneCity(city, chatId) {
  const items = await runApifyScrape(city.searchArea, ["bar","club","restaurant"], 5);
  if (!items?.length) {
    await bot.sendMessage(chatId, `*${city.name}*: no places found.`, { parse_mode:"Markdown" });
    return;
  }
  const parsed = items.map(parseBusy).filter(p => p.livePct || p.liveText);
  const sorted = parsed.sort((a,b) => (b.livePct||0) - (a.livePct||0));
  let text = `👥 *${city.name}:*\n\n`;
  if (!sorted.length) {
    text += "_No live data. Top places:_\n\n";
    for (const p of items.slice(0,5)) {
      text += `📍 *${p.title}*\n   ${p.categoryName||""}${p.totalScore?` · ⭐ ${p.totalScore}`:""}\n\n`;
    }
  } else {
    for (const p of sorted.slice(0,6)) {
      const bar = "█".repeat(Math.round((p.livePct||0)/10)) + "░".repeat(10 - Math.round((p.livePct||0)/10));
      text += `📍 *${p.name}*\n   ${p.category}\n   ${bar} ${p.livePct||0}%\n\n`;
    }
  }
  await bot.sendMessage(chatId, text, { parse_mode:"Markdown" });
}

// ─── BOT COMMANDS ────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "👋 *NRW Surge Bot v5*\n\n" +
    "🤖 *Auto:*\n" +
    "🚦 Traffic every 3 min\n" +
    "🛬 Flights every 2 hours\n\n" +
    "📋 *Commands:*\n" +
    "/status — current state\n" +
    "/scan <city> — scan one city\n" +
    "/scan all — scan all cities\n" +
    "/flights — recent arrivals\n" +
    "/crowds <city> — busy places (~$0.02)\n" +
    "/crowds all — all cities (~$0.36)\n" +
    "/cities — list city IDs\n" +
    "/help — this menu",
    { parse_mode:"Markdown" });
});

bot.onText(/\/help/, async (msg) => {
  bot.emit("text", { ...msg, text: "/start" }, msg);
  await bot.sendMessage(msg.chat.id, "/start /status /scan /flights /crowds /cities");
});

bot.onText(/\/cities/, async (msg) => {
  const list = CITIES.map(c => `• \`${c.id}\` — ${c.name}`).join("\n");
  await bot.sendMessage(msg.chat.id, `*Cities:*\n${list}`, { parse_mode:"Markdown" });
});

bot.onText(/\/status/, async (msg) => {
  let text = "📊 *Current Surge:*\n\n";
  const sorted = CITIES.map(c => ({ name:c.name, level:prevLevels[c.id] || "UNKNOWN" }))
                       .sort((a,b) => ({CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,UNKNOWN:0})[b.level] - ({CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,UNKNOWN:0})[a.level]);
  for (const c of sorted) {
    const i = c.level === "CRITICAL" ? "🔴" : c.level === "HIGH" ? "🟠" : c.level === "MEDIUM" ? "🟡" : c.level === "LOW" ? "🟢" : "⚪";
    text += `${i} ${c.name} — ${c.level}\n`;
  }
  await bot.sendMessage(msg.chat.id, text, { parse_mode:"Markdown" });
});

bot.onText(/\/scan(?:\s+(\w+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = match[1]?.toLowerCase();
  if (!arg) {
    await bot.sendMessage(chatId, "Usage: `/scan bochum` or `/scan all`", { parse_mode:"Markdown" });
    return;
  }
  if (arg === "all") {
    await bot.sendMessage(chatId, "⟳ Scanning all cities...");
    await trafficScan();
    return;
  }
  const city = CITIES.find(c => c.id === arg);
  if (!city) { await bot.sendMessage(chatId, `❌ Unknown city: ${arg}`); return; }

  await bot.sendMessage(chatId, `⟳ Scanning *${city.name}* (${city.streets.length} streets)...`, { parse_mode:"Markdown" });
  try {
    const d = await scanCityStreets(city);
    const icon = d.level === "CRITICAL" ? "🔴" : d.level === "HIGH" ? "🟠" : d.level === "MEDIUM" ? "🟡" : "🟢";
    let text = `${icon} *${city.name} — ${d.level} (${d.score}/10)*\n🚦 Flow: ${d.avgRatio}%`;
    if (d.weather.rain) text += `\n🌧 Rain: ${d.weather.mm}mm`;
    text += `\n\n*Streets:*\n`;
    for (const s of d.streets) {
      const si = s.status === "JAM" ? "🔴" : s.status === "SLOW" ? "🟠" : s.status === "MODERATE" ? "🟡" : "🟢";
      text += `${si} ${s.name} — ${s.speed}km/h (${s.pct}%)\n`;
    }
    await bot.sendMessage(chatId, text, { parse_mode:"Markdown" });
  } catch(e) {
    await bot.sendMessage(chatId, `❌ ${e.message}`);
  }
});

bot.onText(/\/flights/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "⟳ Checking arrivals...");
  await flightScan();
  let text = "✈️ *Recent arrivals:*\n\n";
  for (const ap of AIRPORTS) {
    const flights = recentFlights[ap.code] || [];
    text += `*${ap.name} (${ap.code})*: ${flights.length} flights\n`;
    for (const f of flights.slice(0,5)) text += `  ✈️ ${f.flight} ${f.origin}\n`;
    text += "\n";
  }
  await bot.sendMessage(chatId, text, { parse_mode:"Markdown" });
});

bot.onText(/\/crowds(?:\s+(\w+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = match[1]?.toLowerCase();
  if (!arg) {
    await bot.sendMessage(chatId, "Usage: `/crowds bochum` or `/crowds all`", { parse_mode:"Markdown" });
    return;
  }
  if (arg === "all") {
    await bot.sendMessage(chatId, `⟳ Scraping all ${CITIES.length} cities (~$${(CITIES.length * 0.02).toFixed(2)})...`);
    for (const city of CITIES) {
      try { await bot.sendMessage(chatId, `⟳ ${city.name}...`); await scrapeOneCity(city, chatId); }
      catch(e) { await bot.sendMessage(chatId, `❌ ${city.name}: ${e.message}`); }
    }
    await bot.sendMessage(chatId, "✅ Done.");
    return;
  }
  const city = CITIES.find(c => c.id === arg);
  if (!city) { await bot.sendMessage(chatId, `❌ Unknown city: ${arg}`); return; }
  await bot.sendMessage(chatId, `⟳ Scraping *${city.name}* (~$0.02)...`, { parse_mode:"Markdown" });
  try { await scrapeOneCity(city, chatId); }
  catch(e) { await bot.sendMessage(chatId, `❌ ${e.message}`); }
});

// ─── START ───────────────────────────────────────────────────────────────────
console.log("NRW Surge Bot v5 started.");
bot.sendMessage(CHAT_ID,
  `✅ *NRW Surge Bot v5*\n${CITIES.length} cities · ${AIRPORTS.length} airports\n🚦 Traffic /3 min\n🛬 Flights /2 h\n\nSend /start for commands.`,
  { parse_mode:"Markdown" });

trafficScan();
flightScan();
setInterval(trafficScan, TRAFFIC_INTERVAL);
setInterval(flightScan, FLIGHT_INTERVAL);
