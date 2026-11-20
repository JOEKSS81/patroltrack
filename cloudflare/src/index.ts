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
  // Avisos SMS de la pestanya Benzina (Bird). Clau de workspace bk_eu1_… o bk_us1_….
  BIRD_API_KEY?: string;
  // Remitent alfanumèric reclamat a Bird (màx. 11 caràcters). Per defecte "PatrolTrak".
  SMS_FROM?: string;
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

// Registre de diagnòstic de /api/ingest (best effort). Es queden els 500 més recents.
async function logIngestHit(env: Env, outcome: string, source: string, groupName: string, text: string): Promise<void> {
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ingest_hits (received_at, outcome, source, group_name, text_preview) VALUES (?, ?, ?, ?, ?)")
        .bind(new Date().toISOString(), outcome, source.slice(0, 20), groupName.slice(0, MAX_GROUP_LENGTH), text.slice(0, 100)),
      env.DB.prepare("DELETE FROM ingest_hits WHERE id <= (SELECT MAX(id) FROM ingest_hits) - 500"),
    ]);
  } catch {
    // Mai fallar per culpa del registre.
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
  if (contentType.includes("application/json") || text.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) ? parsed as IngestBody : null;
    } catch {
      // MacroDroid/Tasker no escapen les cometes ni els salts de línia del text de la
      // notificació: el JSON queda trencat. Recupera els camps de la plantilla documentada.
      const m = text.match(/"message"\s*:\s*"([\s\S]*?)"\s*,\s*"group_name"\s*:\s*"([\s\S]*?)"\s*,\s*"source"\s*:\s*"(\w*)"\s*}\s*$/);
      return m ? { message: m[1], group_name: m[2], source: m[3] } : null;
    }
  }
  const params = new URLSearchParams(text);
  return {
    message: params.get("message"),
    group_name: params.get("group_name"),
    source: params.get("source"),
  };
}

// ── Grups gestionables des de Config ─────────────────────────────────────────
type GroupStatus = "active" | "pending" | "off";
const GENERIC_GROUP_NAMES = new Set(["", "whatsapp", "telegram", "report manual", "(sense grup)"]);

// WhatsApp a vegades posa el comptador al títol ("Grup (3 missatges)") o el format
// "Persona @ Grup". Es neteja perquè el mateix grup no surti repetit a Config.
function normalizeGroupName(source: string, raw: string): string {
  let name = raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  if (source === "whatsapp") {
    name = name.replace(/\s*\(\d+\s+[^)]*\)\s*$/u, "").trim();
    const at = name.lastIndexOf(" @ ");
    if (at > 0) name = name.slice(at + 3).trim();
  }
  return name.slice(0, MAX_GROUP_LENGTH);
}

// Decideix si s'han de desar els avisos d'un grup i en porta el compte.
// Grups nous: WhatsApp → pendent (cal activar-lo a Config); Telegram → actiu.
async function groupGate(env: Env, source: string, name: string): Promise<GroupStatus | "skip"> {
  if ((source !== "whatsapp" && source !== "telegram") || GENERIC_GROUP_NAMES.has(name.toLowerCase())) return "skip";
  const now = new Date().toISOString();
  const initial: GroupStatus = source === "telegram" ? "active" : "pending";
  try {
    const row = await env.DB.prepare(`
      INSERT INTO group_settings (source, name, status, first_seen, last_seen, hits)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT (source, name) DO UPDATE SET last_seen = excluded.last_seen, hits = hits + 1
      RETURNING status
    `).bind(source, name, initial, now, now).first<{ status: GroupStatus }>();
    return row?.status ?? initial;
  } catch (error) {
    // Si la taula encara no existeix (desplegament a mitges), no bloquegis res.
    console.error("groupGate failed", error);
    return "skip";
  }
}

async function handleIngest(env: Env, req: Request): Promise<Response> {
  if (!env.INGEST_TOKEN) return json({ ok: false, reason: "INGEST_TOKEN no configurat" }, 500);
  if (!authenticated(req, env, new URL(req.url))) {
    await logIngestHit(env, "auth_fail", "", "", "");
    return json({ ok: false, reason: "token invàlid" }, 401);
  }
  const body = await readIngestBody(req);
  if (!body) {
    await logIngestHit(env, "bad_body", "", "", "");
    return json({ ok: false, reason: "cos invàlid o massa gran" }, 400);
  }
  const message = stringValue(body.message).trim();
  if (!message) {
    await logIngestHit(env, "empty", stringValue(body.source), stringValue(body.group_name), "");
    return json({ ok: false, reason: "missatge buit" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) return json({ ok: false, reason: "missatge massa llarg" }, 413);

  const sourceRaw = stringValue(body.source).trim().toLowerCase() || "whatsapp";
  const allowedSources = new Set(["whatsapp", "telegram", "manual", "test"]);
  if (!allowedSources.has(sourceRaw)) return json({ ok: false, reason: "source no vàlid" }, 400);
  const groupName = normalizeGroupName(sourceRaw, stringValue(body.group_name));

  const gate = await groupGate(env, sourceRaw, groupName);
  if (gate === "pending" || gate === "off") {
    // No es guarda el text: el grup no està autoritzat (pot ser un xat privat).
    await logIngestHit(env, `group_${gate}`, sourceRaw, groupName, "");
    return json({
      ok: true, stored: false, group_status: gate,
      reason: gate === "pending" ? "grup nou: activa'l a Config → Grups" : "grup desactivat a Config",
    });
  }

  // Les notificacions del mòbil (MacroDroid/Tasker) es poden repetir: Android torna a
  // publicar la mateixa notificació quan s'actualitza. Ignora el mateix missatge del
  // mateix grup si ja l'hem desat en els darrers 15 minuts.
  if (sourceRaw !== "manual") {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const dup = await env.DB.prepare(
      "SELECT id FROM detections WHERE group_name = ? AND raw_message = ? AND created_at > ? LIMIT 1",
    ).bind(groupName, message.slice(0, MAX_RAW_MESSAGE_LENGTH), since).first();
    if (dup) {
      await logIngestHit(env, "duplicate", sourceRaw, groupName, message);
      return json({ ok: true, stored: false, duplicate: true, reason: "missatge repetit" });
    }
  }

  const result = await storeDetection(env, message, groupName, sourceRaw);
  await logIngestHit(env, result.stored ? "stored" : "not_patrol", sourceRaw, groupName, message);
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
  const gate = await groupGate(env, "telegram", groupName);
  if (gate === "off" || gate === "pending") {
    await logTelegramHit(env, `group_${gate}`, { chat_id: chatId, chat_title: chatTitle });
    return json({ ok: true, stored: false, reason: "grup desactivat a Config" });
  }
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

async function handleGroupSettingsList(env: Env, req: Request, url: URL): Promise<Response> {
  if (!authenticated(req, env, url)) return json({ ok: false, reason: "token invàlid" }, 401);
  const { results } = await env.DB.prepare(`
    SELECT g.source, g.name, g.status, g.added_by, g.first_seen, g.last_seen, g.hits,
           (SELECT COUNT(*) FROM detections d WHERE d.group_name = g.name AND d.source = g.source) AS detections
    FROM group_settings g
    ORDER BY CASE g.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, g.last_seen DESC
  `).all();
  return json({ ok: true, groups: results });
}

async function handleGroupSettingsSave(env: Env, req: Request, url: URL): Promise<Response> {
  if (!authenticated(req, env, url)) return json({ ok: false, reason: "token invàlid" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(body)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const source = stringValue(body.source).trim().toLowerCase();
  const status = stringValue(body.status).trim() || "active";
  if (source !== "whatsapp" && source !== "telegram") return json({ ok: false, reason: "origen ha de ser whatsapp o telegram" }, 400);
  if (!["active", "pending", "off"].includes(status)) return json({ ok: false, reason: "estat invàlid" }, 400);
  const name = normalizeGroupName(source, stringValue(body.name));
  if (GENERIC_GROUP_NAMES.has(name.toLowerCase()) || name.length < 2) return json({ ok: false, reason: "nom de grup invàlid" }, 400);
  const addedBy = stringValue(body.added_by).trim().slice(0, 40) || null;
  await env.DB.prepare(`
    INSERT INTO group_settings (source, name, status, added_by, first_seen, hits)
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT (source, name) DO UPDATE SET status = excluded.status,
      added_by = COALESCE(excluded.added_by, group_settings.added_by)
  `).bind(source, name, status, addedBy, new Date().toISOString()).run();
  return json({ ok: true, source, name, status });
}

async function handleGroupSettingsDelete(env: Env, req: Request, url: URL): Promise<Response> {
  if (!authenticated(req, env, url)) return json({ ok: false, reason: "token invàlid" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(body)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const r = await env.DB.prepare("DELETE FROM group_settings WHERE source = ? AND name = ?")
    .bind(stringValue(body.source).trim().toLowerCase(), stringValue(body.name)).run();
  return json({ ok: true, deleted: r.meta?.changes ?? 0 });
}

// ── Preus de carburants (dades obertes del Ministeri, província de Lleida = 25) ──
// El Ministeri actualitza cada ~30 min. Es guarda a la Cache API per no saturar-lo.
const FUEL_SOURCE =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/25";
const FUEL_CACHE_SECONDS = 1800;
const FUEL_FIELDS: Record<string, string> = {
  g95: "Precio Gasolina 95 E5",
  g98: "Precio Gasolina 98 E5",
  diesel: "Precio Gasoleo A",
  dieselp: "Precio Gasoleo Premium",
  glp: "Precio Gases licuados del petróleo",
};

function parseEsNumber(value: unknown): number | null {
  const s = stringValue(value).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type FuelStation = {
  id: string; name: string; address: string; town: string; hours: string;
  lat: number | null; lng: number | null; prices: Record<string, number>;
};
type FuelData = { updated: string; count: number; stations: FuelStation[] };

async function fetchFuelData(): Promise<FuelData> {
  const upstream = await fetch(FUEL_SOURCE, { headers: { accept: "application/json" } });
  if (!upstream.ok) throw new Error(`font no disponible (${upstream.status})`);
  const raw: unknown = await upstream.json();
  if (!isRecord(raw) || !Array.isArray(raw.ListaEESSPrecio)) throw new Error("format inesperat");
  const stations = raw.ListaEESSPrecio.filter(isRecord).map((s): FuelStation => {
    const prices: Record<string, number> = {};
    for (const [key, field] of Object.entries(FUEL_FIELDS)) {
      const p = parseEsNumber(s[field]);
      if (p !== null) prices[key] = p;
    }
    return {
      id: stringValue(s.IDEESS),
      name: stringValue(s["Rótulo"]).trim(),
      address: stringValue(s["Dirección"]).trim(),
      town: stringValue(s.Municipio).trim(),
      hours: stringValue(s.Horario).trim(),
      lat: parseEsNumber(s.Latitud),
      lng: parseEsNumber(s["Longitud (WGS84)"]),
      prices,
    };
  }).filter((s) => s.id && s.lat !== null && s.lng !== null && Object.keys(s.prices).length > 0);
  return { updated: stringValue(raw.Fecha), count: stations.length, stations };
}

// Llegeix de la memòria cau (30 min) o del Ministeri, i desa el resultat a la cau.
async function getFuelData(ctx: ExecutionContext): Promise<FuelData> {
  // `lib` DOM no coneix caches.default; als Workers sí que existeix.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request("https://patroltrack.internal/api/fuel-v1");
  const hit = await cache.match(cacheKey);
  if (hit) return await hit.json() as FuelData;
  const data = await fetchFuelData();
  const res = new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${FUEL_CACHE_SECONDS}` },
  });
  ctx.waitUntil(cache.put(cacheKey, res));
  return data;
}

async function handleFuel(ctx: ExecutionContext): Promise<Response> {
  try {
    const data = await getFuelData(ctx);
    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${FUEL_CACHE_SECONDS}`,
        ...CORS,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "font no disponible" }, 502);
  }
}

// ── Avisos SMS de preu (Bird) ────────────────────────────────────────────────
const FUEL_LABELS: Record<string, string> = {
  g95: "Gasolina 95", g98: "Gasolina 98", diesel: "Diesel", dieselp: "Diesel+", glp: "GLP",
};
const MAX_FUEL_ALERTS = 20;            // límit global: cada SMS costa diners
const MAX_SMS_PER_ALERT_PER_DAY = 3;
const SMS_QUIET_START = 22;            // no s'envia de 22 h a 8 h (hora de Madrid)
const SMS_QUIET_END = 8;

function normalizePhone(input: string): string | null {
  let p = input.replace(/[\s.\-()]/g, "");
  if (/^[6789]\d{8}$/.test(p)) p = `+34${p}`;  // mòbil o fix espanyol sense prefix
  if (p.startsWith("0034")) p = `+${p.slice(2)}`;
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

function maskPhone(p: string): string {
  return p.length > 6 ? `${p.slice(0, 3)}•••${p.slice(-3)}` : "•••";
}

async function sendSms(env: Env, to: string, text: string): Promise<{ ok: boolean; status: number; detail?: string }> {
  if (!env.BIRD_API_KEY) return { ok: false, status: 0, detail: "BIRD_API_KEY no configurada" };
  const region = /^b[km]_(eu1|us1)_/.exec(env.BIRD_API_KEY)?.[1] ?? "eu1";
  const res = await fetch(`https://${region}.platform.bird.com/v1/sms/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.BIRD_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      to, from: env.SMS_FROM || "PatrolTrak", text, category: "transactional",
      options: { smart_encoding: true }, tags: [{ name: "app", value: "patroltrack-benzina" }],
    }),
  });
  if (res.ok) return { ok: true, status: res.status };
  const detail = (await res.text()).slice(0, 300);
  console.error("Bird SMS error", res.status, detail);
  return { ok: false, status: res.status, detail };
}

function fuelSmsText(name: string, town: string, fuel: string, price: number, reason: string): string {
  return `PatrolTrack: ${FUEL_LABELS[fuel] ?? fuel} a ${name} (${town}) ara ${price.toFixed(3).replace(".", ",")} EUR. ${reason}`;
}

async function handleFuelAlertCreate(env: Env, req: Request, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (!authenticated(req, env, url)) return json({ ok: false, reason: "token invàlid (configura'l a la pestanya Config)" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(body)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const phone = normalizePhone(stringValue(body.phone));
  const stationId = stringValue(body.station_id).trim();
  const fuel = stringValue(body.fuel).trim();
  const target = typeof body.target === "number" && body.target > 0 ? body.target : null;
  if (!phone) return json({ ok: false, reason: "telèfon invàlid (ex. 612345678 o +34612345678)" }, 400);
  if (!stationId || !FUEL_FIELDS[fuel]) return json({ ok: false, reason: "gasolinera o carburant invàlid" }, 400);

  const data = await getFuelData(ctx);
  const st = data.stations.find((s) => s.id === stationId);
  const price = st?.prices[fuel];
  if (!st || price == null) return json({ ok: false, reason: "aquesta gasolinera no ven aquest carburant" }, 404);

  const existing = await env.DB.prepare("SELECT id FROM fuel_alerts WHERE phone = ? AND station_id = ? AND fuel = ?")
    .bind(phone, stationId, fuel).first();
  if (!existing) {
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM fuel_alerts").first<{ n: number }>();
    if ((total?.n ?? 0) >= MAX_FUEL_ALERTS) return json({ ok: false, reason: `màxim ${MAX_FUEL_ALERTS} avisos` }, 429);
  }
  await env.DB.prepare(`
    INSERT INTO fuel_alerts (phone, station_id, station_name, fuel, target, last_price, target_hit, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT (phone, station_id, fuel) DO UPDATE SET
      target = excluded.target, last_price = excluded.last_price, station_name = excluded.station_name, target_hit = 0
  `).bind(phone, stationId, `${st.name} (${st.town})`, fuel, target, price, new Date().toISOString()).run();

  // SMS de confirmació: comprova de seguida que l'enviament funciona.
  const reason = target ? `Avis actiu: t'escriurem si baixa o passa per sota de ${target.toFixed(3).replace(".", ",")}.` : "Avis actiu: t'escriurem quan baixi.";
  const sms = await sendSms(env, phone, fuelSmsText(st.name, st.town, fuel, price, reason));
  return json({ ok: true, phone: maskPhone(phone), price, sms_sent: sms.ok, sms_error: sms.ok ? undefined : (sms.detail || `HTTP ${sms.status}`) });
}

async function handleFuelAlertList(env: Env, req: Request, url: URL): Promise<Response> {
  if (!authenticated(req, env, url)) return json({ ok: false, reason: "token invàlid" }, 401);
  const { results } = await env.DB.prepare(
    "SELECT id, phone, station_id, station_name, fuel, target, last_price, last_sent_at FROM fuel_alerts ORDER BY id DESC",
  ).all<{ phone: string }>();
  return json({ ok: true, sms_configured: Boolean(env.BIRD_API_KEY), alerts: results.map((a) => ({ ...a, phone: maskPhone(a.phone) })) });
}

async function handleFuelAlertDelete(env: Env, req: Request, url: URL): Promise<Response> {
  if (!authenticated(req, env, url)) return json({ ok: false, reason: "token invàlid" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  const id = isRecord(body) && typeof body.id === "number" ? body.id : null;
  if (id === null) return json({ ok: false, reason: "id invàlid" }, 400);
  const r = await env.DB.prepare("DELETE FROM fuel_alerts WHERE id = ?").bind(id).run();
  return json({ ok: true, deleted: r.meta?.changes ?? 0 });
}

type FuelAlertRow = {
  id: number; phone: string; station_id: string; fuel: string; target: number | null;
  last_price: number | null; target_hit: number; last_sent_at: string | null;
};

// Cron: compara cada avís amb el preu actual i envia SMS si baixa o creua l'objectiu.
async function runFuelAlerts(env: Env, ctx: ExecutionContext): Promise<void> {
  const { results } = await env.DB.prepare("SELECT * FROM fuel_alerts").all<FuelAlertRow>();
  if (!results.length) return;
  const data = await getFuelData(ctx);
  const { hour } = lleidaHourAndDow(new Date());
  const quiet = hour >= SMS_QUIET_START || hour < SMS_QUIET_END;
  const today = new Date().toISOString().slice(0, 10);

  for (const a of results) {
    const st = data.stations.find((s) => s.id === a.station_id);
    const now = st?.prices[a.fuel];
    if (!st || now == null) continue;
    const dropped = a.last_price != null && now < a.last_price - 0.0005;
    const under = a.target != null && now <= a.target;
    const crossed = under && !a.target_hit;
    // De nit no s'envia ni s'actualitza last_price: la baixada s'avisarà al matí.
    if (quiet) continue;

    let sent = false;
    if (dropped || crossed) {
      const sentToday = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM fuel_sms_log WHERE alert_id = ? AND substr(sent_at, 1, 10) = ?",
      ).bind(a.id, today).first<{ n: number }>().catch(() => ({ n: 0 }));
      if ((sentToday?.n ?? 0) < MAX_SMS_PER_ALERT_PER_DAY) {
        const reason = dropped && a.last_price != null
          ? `Ha baixat ${((a.last_price - now) * 100).toFixed(1).replace(".", ",")} cent.`
          : "Per sota del teu objectiu.";
        const r = await sendSms(env, a.phone, fuelSmsText(st.name, st.town, a.fuel, now, reason));
        sent = r.ok;
        if (r.ok) {
          await env.DB.prepare("INSERT INTO fuel_sms_log (alert_id, sent_at, price) VALUES (?, ?, ?)")
            .bind(a.id, new Date().toISOString(), now).run();
        }
      }
    }
    await env.DB.prepare(`
      UPDATE fuel_alerts SET last_price = ?, target_hit = ?,
        last_sent_at = CASE WHEN ? THEN ? ELSE last_sent_at END,
        last_sent_price = CASE WHEN ? THEN ? ELSE last_sent_price END
      WHERE id = ?
    `).bind(now, under ? 1 : 0, sent ? 1 : 0, new Date().toISOString(), sent ? 1 : 0, now, a.id).run();
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/api/health") return await handleHealth(env);
      if (req.method === "GET" && url.pathname === "/api/detections") return await handleDetections(env, url);
      if (req.method === "GET" && url.pathname === "/api/probability") return await handleProbability(env, url);
      if (req.method === "POST" && url.pathname === "/api/ingest") return await handleIngest(env, req);
      if (req.method === "GET" && url.pathname === "/api/ingest-fingerprint") return await handleIngestFingerprint(env);
      if (req.method === "GET" && url.pathname === "/api/groups") return await handleGroups(env);
      if (req.method === "GET" && url.pathname === "/api/group-settings") return await handleGroupSettingsList(env, req, url);
      if (req.method === "POST" && url.pathname === "/api/group-settings") return await handleGroupSettingsSave(env, req, url);
      if (req.method === "POST" && url.pathname === "/api/group-settings/delete") return await handleGroupSettingsDelete(env, req, url);
      if (req.method === "GET" && url.pathname === "/api/fuel") return await handleFuel(ctx);
      if (req.method === "POST" && url.pathname === "/api/fuel/alerts") return await handleFuelAlertCreate(env, req, ctx);
      if (req.method === "GET" && url.pathname === "/api/fuel/alerts") return await handleFuelAlertList(env, req, url);
      if (req.method === "POST" && url.pathname === "/api/fuel/alerts/delete") return await handleFuelAlertDelete(env, req, url);
      if (req.method === "POST" && url.pathname === "/api/telegram-webhook") return await handleTelegramWebhook(env, req);
      if (req.method === "GET" && url.pathname === "/api/telegram-status") return await handleTelegramStatus(env);
      if (url.pathname === "/api/telegram-setup") return await handleTelegramSetup(env, req);
      if (req.method === "POST" && url.pathname === "/api/detections/delete-by-group") return await handleDeleteByGroup(env, req);
      if (url.pathname === "/") return json({ name: "PatrolTrack API", ok: true });
      // Diagnòstic: una URL o un mètode mal configurats al mòbil acaben aquí.
      if (url.pathname.startsWith("/api/")) await logIngestHit(env, `route_404 ${req.method}`, "", "", url.pathname);
      return json({ error: "ruta no trobada" }, 404);
    } catch (error) {
      // Do not leak database errors, credentials, or request contents to clients.
      console.error("PatrolTrack request failed", error);
      return json({ error: "error intern" }, 500);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await runFuelAlerts(env, ctx);
    } catch (error) {
      console.error("Fuel alerts cron failed", error);
    }
  },
} satisfies ExportedHandler<Env>;
