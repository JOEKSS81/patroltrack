require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const TARGET_GROUPS = (process.env.WA_GROUPS || "")
  .split(",")
  .map((g) => g.trim().toLowerCase())
  .filter(Boolean);

const PATROL_KEYWORDS = {
  mossos:  ["mossos", "mosso", "policia catalana", "esquadra"],
  guardia: ["guardia civil", "guardia", " gc ", "(gc)", "benemerita"],
  local:   ["policia local", "policía local", "municipal", "urbana"],
};

const PRESENCE_KEYWORDS = [
  "control", "patrulla", "radar", "hi ha", "hay", "estan",
  "cuidado", "compte", "atenció", "atención", "alerta",
  "pillat", "pillado", "multa", "rotonda", "a l'altura", "a la altura",
  "al km", "entrada", "sortida", "salida", "fent controls",
];

const NEGATIVE_KEYWORDS = [
  "ahir", "ayer", "fa dies", "hace días",
  "la setmana passada", "la semana pasada",
  "ja han marxat", "ya se han ido",
  "notícia", "noticia", "broma", "fake",
];

const ZONE_PATTERNS = [
  [/\bN-?II\b|\bnacional\s*2\b/i, "N-II (Lleida centre)"],
  [/\bC-?13\b/i, "C-13 (cap al nord)"],
  [/\bC-?14\b/i, "C-14 (Ponts/Balaguer)"],
  [/\bC-?26\b/i, "C-26 (Balaguer)"],
  [/\bA-?2\b|\bautopista\b/i, "A-2 (autopista)"],
  [/\bcappont\b/i, "Lleida ciutat - Cappont"],
  [/\bbalafia\b|\bbal[aà]fia\b/i, "Lleida ciutat - Balàfia"],
  [/\blleida\b/i, "Lleida ciutat - Centre"],
  [/\bmollerussa\b/i, "Mollerussa"],
  [/\bt[aà]rrega\b/i, "Tàrrega"],
  [/\bbalaguer\b/i, "Balaguer"],
  [/\bla\s*seu\b|\bseu\s*d.urgell\b/i, "La Seu d'Urgell"],
  [/\btremp\b/i, "Tremp"],
  [/\bcervera\b/i, "Cervera"],
  [/\bborges\b/i, "Les Borges Blanques"],
  [/\bponts?\b/i, "C-14 (Ponts/Balaguer)"],
];

function normalizeText(text) {
  return text.toLowerCase()
    .replace(/[àá]/g, "a").replace(/[èé]/g, "e")
    .replace(/[íï]/g, "i").replace(/[òó]/g, "o")
    .replace(/[úü]/g, "u").replace(/ç/g, "c").replace(/ñ/g, "n");
}

function extractPatrolInfo(message) {
  if (!message || message.trim().length < 5) return null;
  const t = normalizeText(message);
  if (NEGATIVE_KEYWORDS.some((k) => t.includes(k))) return null;
  const hasPresence = PRESENCE_KEYWORDS.some((k) => t.includes(k));
  let patrolType = "unknown";
  for (const [type, keywords] of Object.entries(PATROL_KEYWORDS)) {
    if (keywords.some((k) => t.includes(k))) { patrolType = type; break; }
  }
  const hasPatrol = patrolType !== "unknown";
  if (!hasPresence && !hasPatrol) return null;
  if (hasPatrol && !hasPresence) {
    const roadHints = ["km", "rotonda", "carretera", "carrer", "calle", "avinguda"];
    if (!roadHints.some((h) => t.includes(h))) return null;
  }
  let zoneNorm = "Desconeguda", zoneLiteral = "";
  for (const [pattern, zone] of ZONE_PATTERNS) {
    const m = t.match(pattern);
    if (m) { zoneLiteral = m[0]; zoneNorm = zone; break; }
  }
  let score = 0;
  if (hasPatrol) score += 2;
  if (zoneNorm !== "Desconeguda") score += 1;
  if (["control","radar","patrulla","cuidado","compte","alerta"].some((k) => t.includes(k))) score += 2;
  if (t.length > 30) score += 1;
  const confidence = score >= 5 ? "alta" : score >= 3 ? "mitja" : "baixa";
  return { patrol_type: patrolType, zone: zoneLiteral || zoneNorm, zone_norm: zoneNorm, confidence };
}

async function saveDetection(result, groupName, rawMessage) {
  try {
    await axios.post(BACKEND_URL + "/api/detections/manual", {
      zone: result.zone,
      zone_norm: result.zone_norm,
      patrol_type: result.patrol_type,
      source: "whatsapp",
      raw_message: rawMessage,
      confidence: result.confidence,
      group_name: groupName,
    });
  } catch (err) {
    console.error("  Error guardant:", err.message);
  }
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "patroltrack" }),
  puppeteer: {
    headless: true,
    executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("\nEscaneja aquest QR amb el teu WhatsApp:\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => console.log("WhatsApp autenticat"));

client.on("ready", () => {
  console.log("WhatsApp connectat i llest");
  console.log(TARGET_GROUPS.length
    ? "Filtrant grups: " + TARGET_GROUPS.join(", ")
    : "Escoltant TOTS els grups");
  console.log("Esperant missatges...\n");
});

client.on("message", async (msg) => {
  if (!msg.from.endsWith("@g.us")) return;
  const chat = await msg.getChat();
  const groupName = chat.name || "";
  if (TARGET_GROUPS.length) {
    if (!TARGET_GROUPS.some((t) => groupName.toLowerCase().includes(t))) return;
  }
  const body = msg.body && msg.body.trim();
  if (!body) return;
  console.log("[WA] " + groupName + ": " + body.substring(0, 80));
  const result = extractPatrolInfo(body);
  if (result) {
    await saveDetection(result, groupName, body);
    console.log("  Desat: " + result.patrol_type + " a " + result.zone_norm + " (" + result.confidence + ")");
  } else {
    console.log("  No rellevant");
  }
});

client.on("disconnected", (r) => console.log("Desconnectat:", r));
client.initialize();
