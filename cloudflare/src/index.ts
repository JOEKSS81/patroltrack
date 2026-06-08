// PatrolTrack — Cloudflare Worker API
// Substitueix backend/main.py (FastAPI). Tota la lògica corre serverless;
// la persistència és D1. Cap procés en marxa 24/7: el Worker desperta a cada
// petició HTTP i es torna a aturar.

import { extractPatrolInfo } from "./extractor";

export interface Env {
  DB: D1Database;
  INGEST_TOKEN?: string; // secret per autenticar /api/ingest (vegeu README)
  TELEGRAM_WEBHOOK_SECRET?: string; // secret que valida que el webhook és de Telegram
  TELEGRAM_BOT_TOKEN?: string; // token del bot (opcional) — necessari només per /api/telegram-status
}

// Registra un hit al webhook de Telegram per al panell de diagnòstic.
// Best-effort: si el INSERT falla, ho ignorem (no volem que un error de log
// trenqui la resposta al webhook).
async function logTelegramHit(
  env: Env,
  outcome: string,
  details: { reason?: string; chat_id?: string | number; chat_title?: string; text?: string } = {},
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO telegram_hits (received_at, outcome, reason, chat_id, chat_title, text_preview)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      new Date().toISOString(),
      outcome,
      details.reason ?? null,
      details.chat_id != null ? String(details.chat_id) : null,
      details.chat_title ?? null,
      details.text ? details.text.slice(0, 100) : null,
    ).run();
  } catch { /* swallow */ }
}

// -- utilitats ------------------------------------------------------------

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-ingest-token,x-telegram-bot-api-secret-token",
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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10), 2000);
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

// POST /api/ingest — endpoint per a Tasker / PWA.
// Token: header `x-ingest-token: <secret>` O bé query param `?token=<secret>`
// Body: JSON `{message, group_name?, source?}` O form-encoded `message=X&group_name=Y&source=Z`
// Per a Tasker HTTP Post legacy (sense suport per headers personalitzats),
// usar la URL: /api/ingest?token=XXX amb body form-encoded.
async function handleIngest(env: Env, req: Request): Promise<Response> {
  if (!env.INGEST_TOKEN) return json({ ok: false, reason: "INGEST_TOKEN no configurat al Worker" }, 500);
  const url = new URL(req.url);
  const token = req.headers.get("x-ingest-token") || url.searchParams.get("token");
  if (token !== env.INGEST_TOKEN) return json({ ok: false, reason: "token invàlid" }, 401);

  // Accepta JSON o form-encoded
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  let body: { message?: string; group_name?: string; source?: string } = {};
  try {
    if (ct.includes("application/json")) {
      body = await req.json();
    } else {
      // form-urlencoded o sense Content-Type (Tasker legacy)
      const text = await req.text();
      const params = new URLSearchParams(text);
      body = {
        message: params.get("message") ?? undefined,
        group_name: params.get("group_name") ?? undefined,
        source: params.get("source") ?? undefined,
      };
    }
  } catch { return json({ ok: false, reason: "cos invàlid" }, 400); }

  const message = (body.message ?? "").trim();
  if (!message) return json({ ok: false, reason: "missatge buit" }, 400);

  const source = body.source ?? "whatsapp";
  const info = extractPatrolInfo(message, source);
  if (!info) return json({ ok: true, stored: false, reason: "no és una alerta de patrulla" });

  const now = new Date();
  const { hour, dow } = lleidaHourAndDow(now);
  const groupName = (body.group_name ?? "").slice(0, 200);

  const ins = await env.DB.prepare(`
    INSERT INTO detections
      (created_at, hour, day_of_week, zone, zone_norm, patrol_type,
       source, group_name, raw_message, confidence, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    now.toISOString(), hour, dow,
    info.zone, info.zone_norm, info.patrol_type,
    info.source, groupName, message.slice(0, 1000),
    info.confidence, info.lat, info.lng,
  ).run();

  return json({
    ok: true,
    stored: true,
    id: ins.meta?.last_row_id ?? null,
    patrol_type: info.patrol_type,
    zone_norm: info.zone_norm,
    confidence: info.confidence,
  });
}

// POST /api/telegram-webhook — endpoint que rep updates del bot @Patrol_trackBot.
// Telegram l'invoca cada cop que arriba un missatge a un grup on el bot és membre
// (i amb privacy mode OFF al BotFather, també missatges no-comanda).
//
// Autenticació: Telegram envia el header `x-telegram-bot-api-secret-token` amb el
// secret que s'ha registrat al setWebhook. El comparem amb env.TELEGRAM_WEBHOOK_SECRET.
//
// Identificació del grup: per chat.id (numèric estable), no per nom. El nom es
// desa només per visualització i pot contenir emojis sense problema.
async function handleTelegramWebhook(env: Env, req: Request): Promise<Response> {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    await logTelegramHit(env, "auth_missing");
    return json({ ok: false, reason: "TELEGRAM_WEBHOOK_SECRET no configurat" }, 500);
  }
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (got !== env.TELEGRAM_WEBHOOK_SECRET) {
    await logTelegramHit(env, "auth_fail", { reason: got ? "secret diferent" : "header absent" });
    // Important: 200 i ok:false perquè Telegram no reintenti en bucle.
    return json({ ok: false, reason: "secret invàlid" }, 200);
  }

  let update: any;
  try { update = await req.json(); }
  catch {
    await logTelegramHit(env, "json_error");
    return json({ ok: true, ignored: "JSON invàlid" });
  }

  // Telegram envia diferents tipus d'updates. Ens interessen els que tenen text:
  // message, edited_message, channel_post, edited_channel_post.
  const msg = update?.message
           || update?.edited_message
           || update?.channel_post
           || update?.edited_channel_post;
  if (!msg) {
    await logTelegramHit(env, "ignored_no_msg", { reason: `update_keys=${Object.keys(update || {}).join(",")}` });
    return json({ ok: true, ignored: "no és un missatge" });
  }

  const text: string = msg.text || msg.caption || "";
  const chatPreview = msg.chat?.title || msg.chat?.username || (msg.chat?.id ? `chat:${msg.chat.id}` : "?");
  if (!text || text.trim().length < 5) {
    await logTelegramHit(env, "ignored_short", { chat_id: msg.chat?.id, chat_title: chatPreview, text });
    return json({ ok: true, ignored: "missatge buit/curt" });
  }

  const chat = msg.chat || {};
  const chatId: number | string = chat.id ?? "?";
  const chatTitle: string = chat.title || chat.username || `chat:${chatId}`;

  // Suport per a grups "Forum" (supergroups amb topics).
  // Si el missatge ve d'un topic, msg.message_thread_id té l'id del topic
  // i msg.is_topic_message === true. El nom del topic no ve al webhook;
  // l'ID és el que tenim.
  const threadId = msg.message_thread_id;
  const isTopic = !!msg.is_topic_message;
  const topicSuffix = isTopic && threadId ? ` › topic#${threadId}` : "";

  // Identifiquem el grup amb "Títol (chat_id)" — emojis sense problema.
  const groupName = `${chatTitle} (${chatId})${topicSuffix}`.slice(0, 200);

  const info = extractPatrolInfo(text, "telegram");
  if (!info) {
    await logTelegramHit(env, "rejected_no_patrol", { chat_id: chatId, chat_title: chatTitle, text });
    return json({ ok: true, stored: false, reason: "no és una alerta de patrulla" });
  }

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
    info.source, groupName, text.slice(0, 1000),
    info.confidence, info.lat, info.lng,
  ).run();

  await logTelegramHit(env, "stored", { chat_id: chatId, chat_title: chatTitle, text });

  return json({
    ok: true,
    stored: true,
    id: ins.meta?.last_row_id ?? null,
    patrol_type: info.patrol_type,
    zone_norm: info.zone_norm,
    chat_id: chatId,
  });
}

// GET /api/telegram-status — panell de diagnòstic per al frontend.
// Torna:
//   - secret_configured: bool (TELEGRAM_WEBHOOK_SECRET present al worker)
//   - bot_token_configured: bool (TELEGRAM_BOT_TOKEN present)
//   - hits_24h: per outcome ({stored, rejected_no_patrol, auth_fail, ...})
//   - last_hit: { received_at, outcome, chat_title } | null
//   - webhook_info: resposta de l'API getWebhookInfo de Telegram (si tenim el bot token)
async function handleTelegramStatus(env: Env): Promise<Response> {
  const secretConfigured = !!env.TELEGRAM_WEBHOOK_SECRET;
  const botTokenConfigured = !!env.TELEGRAM_BOT_TOKEN;

  // Comptadors per outcome a les últimes 24h
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const counts: Record<string, number> = {};
  let lastHit: { received_at: string; outcome: string; chat_title: string | null; reason: string | null; text_preview: string | null } | null = null;
  try {
    const rs = await env.DB.prepare(
      "SELECT outcome, COUNT(*) AS n FROM telegram_hits WHERE received_at > ? GROUP BY outcome"
    ).bind(cutoff).all<{ outcome: string; n: number }>();
    for (const r of rs.results ?? []) counts[r.outcome] = r.n;

    const last = await env.DB.prepare(
      "SELECT received_at, outcome, chat_title, reason, text_preview FROM telegram_hits ORDER BY received_at DESC LIMIT 1"
    ).first<{ received_at: string; outcome: string; chat_title: string | null; reason: string | null; text_preview: string | null }>();
    lastHit = last ?? null;
  } catch (e) {
    return json({ ok: false, reason: "DB error: " + (e as Error).message }, 500);
  }

  // Consulta a Telegram per saber l'estat del webhook (si tenim el token)
  let webhookInfo: any = null;
  let webhookError: string | null = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
      const data = await r.json() as any;
      if (data?.ok) {
        webhookInfo = data.result;
      } else {
        webhookError = data?.description || "Telegram API error";
      }
    } catch (e) {
      webhookError = (e as Error).message;
    }
  } else {
    webhookError = "TELEGRAM_BOT_TOKEN no configurat — afegeix-lo amb `wrangler secret put TELEGRAM_BOT_TOKEN`";
  }

  return json({
    ok: true,
    secret_configured: secretConfigured,
    bot_token_configured: botTokenConfigured,
    hits_24h: counts,
    last_hit: lastHit,
    webhook_info: webhookInfo,
    webhook_error: webhookError,
  });
}

// POST /api/detections/delete-by-group — esborra TOTES les deteccions d'un grup.
// Body: { group_name: string }
// Header obligatori: x-ingest-token: <secret> (només el propietari)
async function handleDeleteByGroup(env: Env, req: Request): Promise<Response> {
  if (!env.INGEST_TOKEN) return json({ ok: false, reason: "INGEST_TOKEN no configurat" }, 500);
  const url = new URL(req.url);
  const token = req.headers.get("x-ingest-token") || url.searchParams.get("token");
  if (token !== env.INGEST_TOKEN) return json({ ok: false, reason: "token invàlid" }, 401);

  let body: { group_name?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }

  const groupName = (body.group_name ?? "").trim();
  if (!groupName) return json({ ok: false, reason: "group_name buit" }, 400);

  const res = await env.DB.prepare("DELETE FROM detections WHERE group_name = ?")
    .bind(groupName).run();

  return json({
    ok: true,
    deleted: res.meta?.changes ?? 0,
    group_name: groupName,
  });
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
      if (req.method === "POST" && path === "/api/telegram-webhook") return await handleTelegramWebhook(env, req);
      if (req.method === "GET" && path === "/api/telegram-status") return await handleTelegramStatus(env);
      if (req.method === "POST" && path === "/api/detections/delete-by-group") return await handleDeleteByGroup(env, req);

      // Endpoint senzill per provar que el Worker corre
      if (path === "/") return json({ name: "PatrolTrack API", ok: true });

      return json({ error: "ruta no trobada", path }, 404);
    } catch (e: any) {
      return json({ error: "error intern", detail: String(e?.message ?? e) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
