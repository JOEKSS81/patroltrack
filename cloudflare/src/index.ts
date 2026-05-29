// PatrolTrack — Cloudflare Worker API
// Substitueix backend/main.py (FastAPI). Tota la lògica corre serverless;
// la persistència és D1. Cap procés en marxa 24/7: el Worker desperta a cada
// petició HTTP i es torna a aturar.

import { extractPatrolInfo } from "./extractor";

export interface Env {
  DB: D1Database;
  INGEST_TOKEN?: string; // secret per autenticar /api/ingest (vegeu README)
  TELEGRAM_WEBHOOK_SECRET?: string; // secret per validar el webhook de Telegram
}

// -- utilitats ------------------------------------------------------------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-ingest-token",
  "access-control-max-age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

// hour / day_of_week en hora local d'Europe/Madrid (no UTC).
function lleidaHourAndDow(d: Date): { hour: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const hourStr = parts.find(p => p.type === "hour")?.value ?? "0";
  const wkStr = parts.find(p => p.type === "weekday")?.value ?? "Sun";
  // 0 = Diumenge per compatibilitat amb JavaScript getDay()
  const wkMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    hour: parseInt(hourStr, 10) % 24,
    dow: wkMap[wkStr] ?? 0,
  };
}

// -- handlers -------------------------------------------------------------

async function handleHealth(env: Env): Promise<Response> {
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM detections").first<{ n: number }>();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const last24 = await env.DB.prepare("SELECT COUNT(*) AS n FROM detections WHERE created_at > ?")
    .bind(cutoff).first<{ n: number }>();
  return json({
    status: "ok",
    total: total?.n ?? 0,
    last_24h: last24?.n ?? 0,
  });
}

async function handleDetections(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10), 200);
  const rs = await env.DB.prepare(
    "SELECT * FROM detections ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all();
  return json(rs.results ?? []);
}

const WEIGHTS: Record<string, number> = { alta: 1.0, mitja: 0.6, baixa: 0.3 };

function timeDecay(createdAt: string): number {
  try {
    const days = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 86400000);
    if (days <= 7) return 1.0;
    if (days <= 30) return 0.7;
    if (days <= 90) return 0.4;
    return 0.2;
  } catch {
    return 0.5;
  }
}

async function handleProbability(env: Env, url: URL): Promise<Response> {
  const zone = url.searchParams.get("zone");
  const hourStr = url.searchParams.get("hour");
  if (!zone || hourStr === null) return json({ error: "zone i hour són obligatoris" }, 400);
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return json({ error: "hour ha de ser 0-23" }, 400);

  const hours = [(hour + 23) % 24, hour, (hour + 1) % 24];
  const rs = await env.DB.prepare(`
    SELECT patrol_type, confidence, created_at FROM detections
    WHERE zone_norm = ? AND hour IN (?, ?, ?)
    ORDER BY created_at DESC LIMIT 500
  `).bind(zone, hours[0], hours[1], hours[2]).all<{
    patrol_type: string; confidence: string; created_at: string;
  }>();

  const records = rs.results ?? [];
  if (records.length === 0) {
    return json({
      zone, hour,
      mossos: 0, guardia: 0, local: 0, overall: 0,
      sample_size: 0, reliability: "cap dada",
    });
  }

  const scores: Record<string, number> = { mossos: 0, guardia: 0, local: 0 };
  const counts: Record<string, number> = { mossos: 0, guardia: 0, local: 0 };
  for (const r of records) {
    if (!(r.patrol_type in scores)) continue;
    scores[r.patrol_type] += (WEIGHTS[r.confidence] ?? 0.5) * timeDecay(r.created_at);
    counts[r.patrol_type] += 1;
  }

  const result: Record<string, number> = {};
  for (const t of ["mossos", "guardia", "local"]) {
    result[t] = counts[t] > 0 ? Math.round(Math.min(scores[t] / 28, 1.0) * 1000) / 1000 : 0;
  }
  const overall = Math.max(result.mossos, result.guardia, result.local);
  const n = records.length;
  return json({
    zone, hour,
    ...result,
    overall: Math.round(overall * 1000) / 1000,
    sample_size: n,
    reliability: n >= 20 ? "alta" : n >= 5 ? "mitja" : "baixa",
  });
}

// POST /api/ingest — endpoint per a Tasker. Cos JSON:
//   { message: string, group_name?: string, source?: string }
// Header obligatori: x-ingest-token: <secret>
// Desa una detecció si el missatge sembla una alerta de patrulla.
// Compartit per /api/ingest (manual/Tasker) i /api/telegram (bot).
async function storeDetection(env: Env, message: string, source: string, groupName: string) {
  const info = extractPatrolInfo(message, source);
  if (!info) return { stored: false as const };

  const now = new Date();
  const { hour, dow } = lleidaHourAndDow(now);

  const ins = await env.DB.prepare(`
    INSERT INTO detections
      (created_at, hour, day_of_week, zone, zone_norm, patrol_type,
       source, group_name, raw_message, confidence, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    now.toISOString(), hour, dow,
    info.zone, info.zone_norm, info.patrol_type,
    info.source, groupName.slice(0, 200), message.slice(0, 1000),
    info.confidence, info.lat, info.lng,
  ).run();

  return { stored: true as const, id: ins.meta?.last_row_id ?? null, info };
}

async function handleIngest(env: Env, req: Request): Promise<Response> {
  if (!env.INGEST_TOKEN) return json({ ok: false, reason: "INGEST_TOKEN no configurat al Worker" }, 500);
  const token = req.headers.get("x-ingest-token");
  if (token !== env.INGEST_TOKEN) return json({ ok: false, reason: "token invàlid" }, 401);

  let body: { message?: string; group_name?: string; source?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }

  const message = (body.message ?? "").trim();
  if (!message) return json({ ok: false, reason: "missatge buit" }, 400);

  const res = await storeDetection(env, message, body.source ?? "whatsapp", body.group_name ?? "");
  if (!res.stored) return json({ ok: true, stored: false, reason: "no és una alerta de patrulla" });

  return json({
    ok: true,
    stored: true,
    id: res.id,
    patrol_type: res.info.patrol_type,
    zone_norm: res.info.zone_norm,
    confidence: res.info.confidence,
  });
}

// POST /api/telegram — webhook del bot de Telegram.
// Telegram envia la capçalera X-Telegram-Bot-Api-Secret-Token (definida a setWebhook).
// Sempre responem 200 perquè Telegram no reintenti l'enviament.
async function handleTelegram(env: Env, req: Request): Promise<Response> {
  if (!env.TELEGRAM_WEBHOOK_SECRET ||
      req.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false }, 401);
  }

  let update: any;
  try { update = await req.json(); } catch { return json({ ok: true }); }

  const msg = update?.message ?? update?.channel_post ?? update?.edited_message;
  const text = String(msg?.text ?? msg?.caption ?? "").trim();
  const groupName = String(msg?.chat?.title ?? msg?.chat?.username ?? "Telegram");

  if (text) {
    try { await storeDetection(env, text, "telegram", groupName); } catch { /* ignora errors per no reintentar */ }
  }
  return json({ ok: true });
}

// -- router ---------------------------------------------------------------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/api/health") return await handleHealth(env);
      if (req.method === "GET" && path === "/api/detections") return await handleDetections(env, url);
      if (req.method === "GET" && path === "/api/probability") return await handleProbability(env, url);
      if (req.method === "POST" && path === "/api/ingest") return await handleIngest(env, req);
      if (req.method === "POST" && path === "/api/telegram") return await handleTelegram(env, req);

      // Endpoint senzill per provar que el Worker corre
      if (path === "/") return json({ name: "PatrolTrack API", ok: true });

      return json({ error: "ruta no trobada", path }, 404);
    } catch (e: any) {
      return json({ error: "error intern", detail: String(e?.message ?? e) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
