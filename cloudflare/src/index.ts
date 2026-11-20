// PatrolTrack — Cloudflare Worker API
// Ingestion compatible con Tasker/WhatsApp y Telegram Bot API.
import { extractPatrolInfo } from "./extractor";

export interface Env {
  DB: D1Database;
  INGEST_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  // Opcional para instalaciones con un dominio Pages personalizado.
  APP_ORIGIN?: string;
}

type IngestBody = { message?: unknown; group_name?: unknown; source?: unknown };
type TelegramChat = { id?: number | string; type?: string; title?: string; username?: string };
type TelegramMessage = {
  text?: unknown;
  caption?: unknown;
  chat?: TelegramChat;
  message_thread_id?: number;
  is_topic_message?: boolean;
};
type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_GROUP_LENGTH = 200;
const MAX_RAW_MESSAGE_LENGTH = 1_000;
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-ingest-token,x-telegram-bot-api-secret-token",
  "access-control-max-age": "86400",
};
const DETECTION_INSERT = `
  INSERT INTO detections
    (created_at, hour, day_of_week, zone, zone_norm, patrol_type,
     source, group_name, raw_message, confidence, lat, lng)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function authenticated(req: Request, env: Env, url: URL): boolean {
  if (!env.INGEST_TOKEN) return false;
  const supplied = req.headers.get("x-ingest-token") || url.searchParams.get("token") || "";
  // Constant-time comparison for equal-length strings.
  if (supplied.length !== env.INGEST_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i++) diff |= supplied.charCodeAt(i) ^ env.INGEST_TOKEN.charCodeAt(i);
  return diff === 0;
}

// Europe/Madrid local time, including daylight-saving changes.
function lleidaHourAndDow(date: Date): { hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hour: "numeric", hour12: false, weekday: "short",
  }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? 0) % 24;
  const weekday = parts.find(p => p.type === "weekday")?.value ?? "Sun";
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, dow: weekdays[weekday] ?? 0 };
}

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
      new Date().toISOString(), outcome, details.reason ?? null,
      details.chat_id == null ? null : String(details.chat_id),
      details.chat_title?.slice(0, MAX_GROUP_LENGTH) ?? null,
      details.text?.slice(0, 100) ?? null,
    ).run();
  } catch {
    // Diagnostic logging is best effort; never fail message processing for it.
  }
}

async function storeDetection(
  env: Env,
  message: string,
  groupName: string,
  source: string,
  telegramUpdateId?: number,
): Promise<{ stored: boolean; id: number | null; info: ReturnType<typeof extractPatrolInfo> }> {
  const info = extractPatrolInfo(message, source);
  if (!info) return { stored: false, id: null, info: null };

  const now = new Date();
  const { hour, dow } = lleidaHourAndDow(now);
  const values = [
    now.toISOString(), hour, dow, info.zone, info.zone_norm, info.patrol_type,
    info.source, groupName.slice(0, MAX_GROUP_LENGTH), message.slice(0, MAX_RAW_MESSAGE_LENGTH),
    info.confidence, info.lat, info.lng,
  ];

  if (telegramUpdateId === undefined) {
    const result = await env.DB.prepare(DETECTION_INSERT).bind(...values).run();
    return { stored: true, id: result.meta?.last_row_id ?? null, info };
  }

  // Atomically claim a Telegram update and insert its detection. Telegram retries
  // the same update_id on transient failures; the claim prevents duplicate rows.
  const claim = crypto.randomUUID();
  const [claimResult, detectionResult] = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO telegram_updates (update_id, claim) VALUES (?, ?)")
      .bind(telegramUpdateId, claim),
    env.DB.prepare(`
      INSERT INTO detections
        (created_at, hour, day_of_week, zone, zone_norm, patrol_type,
         source, group_name, raw_message, confidence, lat, lng)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_updates WHERE update_id = ? AND claim = ?)
    `).bind(...values, telegramUpdateId, claim),
  ]);
  const inserted = Number(claimResult.meta?.changes ?? 0) > 0;
  return {
    stored: inserted && Number(detectionResult.meta?.changes ?? 0) > 0,
    id: inserted ? detectionResult.meta?.last_row_id ?? null : null,
    info,
  };
}

async function readIngestBody(req: Request): Promise<IngestBody | null> {
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return null;
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) ? parsed as IngestBody : null;
    } catch { return null; }
  }
  const params = new URLSearchParams(text);
  return {
    message: params.get("message"),
    group_name: params.get("group_name"),
    source: params.get("source"),
  };
}

async function handleIngest(env: Env, req: Request): Promise<Response> {
  if (!env.INGEST_TOKEN) return json({ ok: false, reason: "INGEST_TOKEN no configurat" }, 500);
  if (!authenticated(req, env, new URL(req.url))) return json({ ok: false, reason: "token invàlid" }, 401);
  const body = await readIngestBody(req);
  if (!body) return json({ ok: false, reason: "cos invàlid o massa gran" }, 400);
  const message = stringValue(body.message).trim();
  if (!message) return json({ ok: false, reason: "missatge buit" }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) return json({ ok: false, reason: "missatge massa llarg" }, 413);

  const sourceRaw = stringValue(body.source).trim().toLowerCase() || "whatsapp";
  const allowedSources = new Set(["whatsapp", "telegram", "manual", "test"]);
  if (!allowedSources.has(sourceRaw)) return json({ ok: false, reason: "source no vàlid" }, 400);
  const groupName = stringValue(body.group_name).trim().slice(0, MAX_GROUP_LENGTH);

  // Les notificacions del mòbil (MacroDroid/Tasker) es poden repetir: Android torna a
  // publicar la mateixa notificació quan s'actualitza. Ignora el mateix missatge del
  // mateix grup si ja l'hem desat en els darrers 15 minuts.
  if (sourceRaw !== "manual") {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const dup = await env.DB.prepare(
      "SELECT id FROM detections WHERE group_name = ? AND raw_message = ? AND created_at > ? LIMIT 1",
    ).bind(groupName, message.slice(0, MAX_RAW_MESSAGE_LENGTH), since).first();
    if (dup) return json({ ok: true, stored: false, duplicate: true, reason: "missatge repetit" });
  }

  const result = await storeDetection(env, message, groupName, sourceRaw);
  if (!result.stored) return json({ ok: true, stored: false, reason: "no és una alerta de patrulla" });
  return json({
    ok: true, stored: true, id: result.id,
    patrol_type: result.info?.patrol_type,
    zone_norm: result.info?.zone_norm,
    confidence: result.info?.confidence,
  });
}

async function handleTelegramWebhook(env: Env, req: Request): Promise<Response> {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    await logTelegramHit(env, "auth_missing");
    return json({ ok: false, reason: "TELEGRAM_WEBHOOK_SECRET no configurat" }, 500);
  }
  const suppliedSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    await logTelegramHit(env, "auth_fail", { reason: suppliedSecret ? "secret diferent" : "header absent" });
    // Acknowledge invalid requests so Telegram does not retry bad credentials forever.
    return json({ ok: false, reason: "secret invàlid" });
  }

  let parsed: unknown;
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) throw new Error("payload massa gran");
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("payload massa gran");
    parsed = JSON.parse(raw);
  } catch {
    await logTelegramHit(env, "json_error");
    return json({ ok: true, ignored: "JSON invàlid o massa gran" });
  }
  if (!isRecord(parsed)) {
    await logTelegramHit(env, "ignored_no_msg", { reason: "update no és un objecte" });
    return json({ ok: true, ignored: "update invàlid" });
  }
  const update = parsed as TelegramUpdate;
  const msg = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
  if (!msg || !isRecord(msg)) {
    await logTelegramHit(env, "ignored_no_msg", { reason: "update sense message" });
    return json({ ok: true, ignored: "no és un missatge" });
  }

  const chat = isRecord(msg.chat) ? msg.chat as TelegramChat : {};
  const chatId = chat.id;
  const chatTitle = stringValue(chat.title) || stringValue(chat.username) || (chatId != null ? `chat:${chatId}` : "Telegram");
  const text = (stringValue(msg.text) || stringValue(msg.caption)).trim();
  if (!text || text.length < 5) {
    await logTelegramHit(env, "ignored_short", { chat_id: chatId, chat_title: chatTitle, text });
    return json({ ok: true, ignored: "missatge buit/curt" });
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    await logTelegramHit(env, "ignored_short", { chat_id: chatId, chat_title: chatTitle, reason: "missatge massa llarg" });
    return json({ ok: true, ignored: "missatge massa llarg" });
  }
  // Accept groups/supergroups and channel posts. Private chats are intentionally
  // ignored: this integration is for messages shared into a group/channel.
  if (chat.type && !["group", "supergroup", "channel"].includes(chat.type)) {
    await logTelegramHit(env, "ignored_no_msg", { chat_id: chatId, chat_title: chatTitle, reason: "chat privat ignorat" });
    return json({ ok: true, ignored: "chat privat" });
  }

  const threadId = Number.isSafeInteger(msg.message_thread_id) ? msg.message_thread_id : undefined;
  const topicSuffix = msg.is_topic_message && threadId ? ` › topic#${threadId}` : "";
  const groupName = `${chatTitle} (${chatId ?? "?"})${topicSuffix}`.slice(0, MAX_GROUP_LENGTH);
  const updateId = Number.isSafeInteger(update.update_id) ? update.update_id : undefined;
  const result = await storeDetection(env, text, groupName, "telegram", updateId);
  if (!result.info) {
    await logTelegramHit(env, "rejected_no_patrol", { chat_id: chatId, chat_title: chatTitle, text });
    return json({ ok: true, stored: false, reason: "no és una alerta de patrulla" });
  }
  if (!result.stored) {
    await logTelegramHit(env, "duplicate", { chat_id: chatId, chat_title: chatTitle });
    return json({ ok: true, stored: false, duplicate: true });
  }
  await logTelegramHit(env, "stored", { chat_id: chatId, chat_title: chatTitle, text });
  return json({ ok: true, stored: true, id: result.id, patrol_type: result.info.patrol_type, zone_norm: result.info.zone_norm, chat_id: chatId ?? null });
}

async function handleHealth(env: Env): Promise<Response> {
  const [total, last24] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM detections").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM detections WHERE created_at > ?")
      .bind(new Date(Date.now() - 86_400_000).toISOString()).first<{ n: number }>(),
  ]);
  return json({ status: "ok", total: total?.n ?? 0, last_24h: last24?.n ?? 0 });
}

async function handleDetections(env: Env, url: URL): Promise<Response> {
  const raw = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(raw) ? Math.min(2000, Math.max(1, Math.floor(raw))) : 30;
  const rows = await env.DB.prepare("SELECT * FROM detections ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return json(rows.results ?? []);
}

const WEIGHTS: Record<string, number> = { alta: 1, mitja: 0.6, baixa: 0.3 };
function timeDecay(createdAt: string): number {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return 0.5;
  const days = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return days <= 7 ? 1 : days <= 30 ? 0.7 : days <= 90 ? 0.4 : 0.2;
}

// GET /api/groups — grups DESCOBERTS automàticament: els que han enviat missatges
// reals de patrulla (bot de Telegram o WhatsApp/Tasker).
async function handleGroups(env: Env): Promise<Response> {
  const rs = await env.DB.prepare(`
    SELECT group_name, source, COUNT(*) AS n, MAX(created_at) AS last_seen
    FROM detections
    WHERE source IN ('whatsapp','telegram')
      AND group_name IS NOT NULL
      AND TRIM(group_name) != ''
      AND group_name NOT IN ('Report manual', 'Telegram', 'WhatsApp')
    GROUP BY group_name, source
    ORDER BY n DESC, last_seen DESC
    LIMIT 100
  `).all();
  return json(rs.results ?? []);
}

async function handleProbability(env: Env, url: URL): Promise<Response> {
  const zone = url.searchParams.get("zone")?.trim();
  const hourRaw = url.searchParams.get("hour");
  if (!zone || hourRaw === null) return json({ error: "zone i hour són obligatoris" }, 400);
  const hour = Number(hourRaw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return json({ error: "hour ha de ser 0-23" }, 400);
  const hours = [(hour + 23) % 24, hour, (hour + 1) % 24];
  const rows = await env.DB.prepare(`
    SELECT patrol_type, confidence, created_at FROM detections
    WHERE zone_norm = ? AND hour IN (?, ?, ?) ORDER BY created_at DESC LIMIT 500
  `).bind(zone, ...hours).all<{ patrol_type: string; confidence: string; created_at: string }>();
  const scores = { mossos: 0, guardia: 0, local: 0 };
  const counts = { mossos: 0, guardia: 0, local: 0 };
  for (const row of rows.results ?? []) {
    if (!(row.patrol_type in scores)) continue;
    const type = row.patrol_type as keyof typeof scores;
    scores[type] += (WEIGHTS[row.confidence] ?? 0.5) * timeDecay(row.created_at);
    counts[type]++;
  }
  const result = {
    mossos: Math.round(Math.min(scores.mossos / 28, 1) * 1000) / 1000,
    guardia: Math.round(Math.min(scores.guardia / 28, 1) * 1000) / 1000,
    local: Math.round(Math.min(scores.local / 28, 1) * 1000) / 1000,
  };
  const n = rows.results?.length ?? 0;
  const overall = Math.max(result.mossos, result.guardia, result.local);
  return json({ zone, hour, ...result, overall, sample_size: n, reliability: n >= 20 ? "alta" : n >= 5 ? "mitja" : n ? "baixa" : "cap dada" });
}

async function handleIngestFingerprint(env: Env): Promise<Response> {
  const token = env.INGEST_TOKEN;
  if (!token) return json({ ok: true, configured: false });
  const fingerprint = token.length >= 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : "(token massa curt)";
  return json({ ok: true, configured: true, fingerprint, length: token.length });
}

async function telegramApi(env: Env, method: string, body?: URLSearchParams): Promise<{ response: Response; data: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
      body: body?.toString(), signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    return { response, data: isRecord(data) ? data : null };
  } finally { clearTimeout(timer); }
}

async function handleTelegramStatus(env: Env): Promise<Response> {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  let counts: Record<string, number> = {};
  let lastHit = null;
  try {
    const [rows, last] = await Promise.all([
      env.DB.prepare("SELECT outcome, COUNT(*) AS n FROM telegram_hits WHERE received_at > ? GROUP BY outcome").bind(cutoff).all<{ outcome: string; n: number }>(),
      env.DB.prepare("SELECT received_at, outcome, chat_title, reason, text_preview FROM telegram_hits ORDER BY received_at DESC LIMIT 1").first(),
    ]);
    for (const row of rows.results ?? []) counts[row.outcome] = row.n;
    lastHit = last;
  } catch { return json({ ok: false, reason: "No s'ha pogut llegir el diagnòstic de Telegram" }, 500); }

  let webhookInfo: unknown = null;
  let botInfo: unknown = null;
  let webhookError: string | null = null;
  if (!env.TELEGRAM_BOT_TOKEN) {
    webhookError = "TELEGRAM_BOT_TOKEN no configurat";
  } else {
    try {
      const [{ response: webhookResponse, data: webhookData }, { data: meData }] = await Promise.all([
        telegramApi(env, "getWebhookInfo"), telegramApi(env, "getMe"),
      ]);
      if (webhookResponse.ok && webhookData?.ok === true) webhookInfo = webhookData.result ?? null;
      else webhookError = stringValue(webhookData?.description) || `Telegram HTTP ${webhookResponse.status}`;
      if (meData?.ok === true) botInfo = meData.result ?? null;
    } catch (error) { webhookError = error instanceof Error ? error.message : "Error de connexió amb Telegram"; }
  }
  return json({ ok: true, secret_configured: !!env.TELEGRAM_WEBHOOK_SECRET, bot_token_configured: !!env.TELEGRAM_BOT_TOKEN, hits_24h: counts, last_hit: lastHit, webhook_info: webhookInfo, webhook_error: webhookError, bot_info: botInfo });
}

async function handleTelegramSetup(env: Env, req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, reason: "usa POST" }, 405);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false, reason: "Falten TELEGRAM_BOT_TOKEN o TELEGRAM_WEBHOOK_SECRET" }, 500);
  }
  // Protect the state-changing, unauthenticated setup endpoint from browser CSRF.
  // Set APP_ORIGIN when Pages uses a custom domain.
  const origin = req.headers.get("origin");
  const allowedOrigin = env.APP_ORIGIN || "https://patroltrack.pages.dev";
  if (origin && origin !== allowedOrigin) return json({ ok: false, reason: "origin no autoritzat" }, 403);

  const url = new URL(req.url);
  const webhookUrl = `${url.origin}/api/telegram-webhook`;
  const params = new URLSearchParams({
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: JSON.stringify(["message", "edited_message", "channel_post", "edited_channel_post"]),
  });
  if (url.searchParams.get("drop_pending") === "1") params.set("drop_pending_updates", "true");
  try {
    const { response, data } = await telegramApi(env, "setWebhook", params);
    const ok = response.ok && data?.ok === true;
    return json({ ok, webhook_url: webhookUrl, drop_pending: params.get("drop_pending_updates") === "true", telegram_response: data, error: ok ? null : stringValue(data?.description) || `Telegram HTTP ${response.status}` }, ok ? 200 : 502);
  } catch (error) {
    return json({ ok: false, webhook_url: webhookUrl, error: error instanceof Error ? error.message : "Error de conexión" }, 502);
  }
}

async function handleDeleteByGroup(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (!env.INGEST_TOKEN) return json({ ok: false, reason: "INGEST_TOKEN no configurat" }, 500);
  if (!authenticated(req, env, url)) return json({ ok: false, reason: "token invàlid" }, 401);
  let parsed: unknown;
  try { parsed = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(parsed)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const groupName = stringValue(parsed.group_name).trim();
  if (!groupName) return json({ ok: false, reason: "group_name buit" }, 400);
  const result = await env.DB.prepare("DELETE FROM detections WHERE group_name = ?").bind(groupName).run();
  return json({ ok: true, deleted: result.meta?.changes ?? 0, group_name: groupName });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/api/health") return await handleHealth(env);
      if (req.method === "GET" && url.pathname === "/api/detections") return await handleDetections(env, url);
      if (req.method === "GET" && url.pathname === "/api/probability") return await handleProbability(env, url);
      if (req.method === "POST" && url.pathname === "/api/ingest") return await handleIngest(env, req);
      if (req.method === "GET" && url.pathname === "/api/ingest-fingerprint") return await handleIngestFingerprint(env);
      if (req.method === "GET" && url.pathname === "/api/groups") return await handleGroups(env);
      if (req.method === "POST" && url.pathname === "/api/telegram-webhook") return await handleTelegramWebhook(env, req);
      if (req.method === "GET" && url.pathname === "/api/telegram-status") return await handleTelegramStatus(env);
      if (url.pathname === "/api/telegram-setup") return await handleTelegramSetup(env, req);
      if (req.method === "POST" && url.pathname === "/api/detections/delete-by-group") return await handleDeleteByGroup(env, req);
      if (url.pathname === "/") return json({ name: "PatrolTrack API", ok: true });
      return json({ error: "ruta no trobada" }, 404);
    } catch (error) {
      // Do not leak database errors, credentials, or request contents to clients.
      console.error("PatrolTrack request failed", error);
      return json({ error: "error intern" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
