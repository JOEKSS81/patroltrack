// PatrolTrack — Cloudflare Worker API
// Ingestion compatible con Tasker/WhatsApp y Telegram Bot API.
import { extractPatrolInfo, classifyFollowUp, type FollowUp } from "./extractor";
import { buildModel, zoneProbsResponse, probabilityResponse, type DetRow, type EventRow, type Model } from "./risk";

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

function isAdminToken(env: Env, supplied: string): boolean {
  if (!env.INGEST_TOKEN || !supplied) return false;
  // Constant-time comparison for equal-length strings.
  if (supplied.length !== env.INGEST_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i++) diff |= supplied.charCodeAt(i) ^ env.INGEST_TOKEN.charCodeAt(i);
  return diff === 0;
}

type Identity = { id: string; name: string; admin: boolean; code: string };

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes: number): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Qui fa la petició: l'admin (INGEST_TOKEN) o un amic amb el seu token personal.
async function identify(req: Request, env: Env, url: URL): Promise<Identity | null> {
  const supplied = (req.headers.get("x-ingest-token") || url.searchParams.get("token") || "").trim();
  if (!supplied) return null;
  if (isAdminToken(env, supplied)) return { id: "admin", name: "Admin", admin: true, code: "admin" };
  if (!supplied.startsWith("pt_")) return null;
  try {
    const hash = await sha256Hex(supplied);
    const u = await env.DB.prepare("SELECT id, name, code, last_seen FROM users WHERE token_hash = ? AND revoked = 0")
      .bind(hash).first<{ id: string; name: string; code: string; last_seen: string | null }>();
    if (!u) return null;
    const now = new Date();
    if (!u.last_seen || now.getTime() - Date.parse(u.last_seen) > 3_600_000) {
      await env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now.toISOString(), u.id).run();
    }
    return { id: u.id, name: u.name, admin: false, code: u.code };
  } catch {
    return null;
  }
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
// Si se sap de qui és el mòbil (`owner`), també es guarda a ingest_seen: és el que mira
// el botó "Comprovar que funciona" de Config (només hora, resultat i grup, mai el text).
async function logIngestHit(env: Env, outcome: string, source: string, groupName: string, text: string, owner?: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    const stmts = [
      env.DB.prepare("INSERT INTO ingest_hits (received_at, outcome, source, group_name, text_preview) VALUES (?, ?, ?, ?, ?)")
        .bind(now, outcome, source.slice(0, 20), groupName.slice(0, MAX_GROUP_LENGTH), text.slice(0, 100)),
      env.DB.prepare("DELETE FROM ingest_hits WHERE id <= (SELECT MAX(id) FROM ingest_hits) - 500"),
    ];
    if (owner && source !== "manual" && source !== "test") {
      stmts.push(env.DB.prepare(`
        INSERT INTO ingest_seen (owner, last_at, last_outcome, last_source, last_group) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (owner) DO UPDATE SET last_at = excluded.last_at, last_outcome = excluded.last_outcome,
          last_source = excluded.last_source, last_group = excluded.last_group
      `).bind(owner, now, outcome, source.slice(0, 20), groupName.slice(0, MAX_GROUP_LENGTH)));
    }
    await env.DB.batch(stmts);
  } catch {
    // Mai fallar per culpa del registre.
  }
}

// GET /api/ingest-check — per al botó "Comprovar que funciona": quan va arribar l'últim
// missatge del mòbil d'aquesta persona (MacroDroid) i si fa poc ha arribat algun intent
// amb una clau incorrecta (macro antiga o mal copiada).
async function handleIngestCheck(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who) return json({ ok: false, reason: "token invàlid" }, 401);
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const [seen, authFail, groups] = await Promise.all([
    env.DB.prepare("SELECT last_at, last_outcome, last_source, last_group FROM ingest_seen WHERE owner = ?")
      .bind(who.id).first<{ last_at: string; last_outcome: string; last_source: string; last_group: string }>()
      .catch(() => null),
    env.DB.prepare("SELECT MAX(received_at) AS at FROM ingest_hits WHERE outcome = 'auth_fail' AND received_at > ?")
      .bind(since).first<{ at: string | null }>(),
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM user_groups WHERE owner = ? GROUP BY status")
      .bind(who.id).all<{ status: string; n: number }>(),
  ]);
  const count = (st: string) => (groups.results ?? []).find((g) => g.status === st)?.n ?? 0;
  return json({
    ok: true,
    last_at: seen?.last_at ?? null,
    last_outcome: seen?.last_outcome ?? null,
    last_source: seen?.last_source ?? null,
    last_group: seen?.last_group ?? null,
    auth_fail_at: authFail?.at ?? null,
    groups_active: count("active"),
    groups_pending: count("pending"),
  });
}

// Clau de comparació d'un missatge: minúscules, sense accents, emojis ni puntuació, i
// espais compactats. Així "Mossos a Sort!!" i "mossos a sort" compten com el mateix.
function messageKey(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// El mateix avís sovint es copia o reenvia a diversos grups (i WhatsApp torna a publicar
// la notificació agrupada hores després). Es considera repetit si ja s'ha desat un avís
// amb el mateix text, de QUALSEVOL grup o font, en les darreres 12 hores.
const DUPLICATE_WINDOW_MS = 12 * 3600 * 1000;
async function findRecentDuplicate(env: Env, message: string): Promise<{ id: number; group_name: string | null; source: string } | null> {
  const key = messageKey(message);
  if (!key) return null;
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const rs = await env.DB.prepare(
    "SELECT id, group_name, source, raw_message FROM detections WHERE created_at > ? ORDER BY created_at DESC LIMIT 300",
  ).bind(since).all<{ id: number; group_name: string | null; source: string; raw_message: string | null }>();
  return (rs.results ?? []).find((r) => r.raw_message != null && messageKey(r.raw_message) === key) ?? null;
}
async function isRecentDuplicate(env: Env, message: string): Promise<boolean> {
  return (await findRecentDuplicate(env, message)) !== null;
}

// ── Seguiment dels controls (patrol_events) ──────────────────────────────────
// echo:    el mateix avís ha arribat per un altre grup (més gent l'ha vist)
// still:   "segueixen", "encara hi són", "sí" a un "encara estan?"
// cleared: "ja han marxat", "fins Escaló net", "no" a un "encara estan?"
// ask:     "encara estan?" (per entendre el sí/no que ve després)
// Amb això es mesura quanta estona dura cada control i es calcula la possibilitat.
async function addPatrolEvent(
  env: Env, kind: string, detectionId: number | null, zone: string | null,
  source: string, groupName: string, message: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO patrol_events (created_at, kind, detection_id, zone_norm, source, group_name, raw_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(new Date().toISOString(), kind, detectionId, zone, source.slice(0, 20),
    groupName.slice(0, MAX_GROUP_LENGTH), message.slice(0, MAX_RAW_MESSAGE_LENGTH)).run();
  riskCache = null;
}

async function recordEcho(env: Env, original: { id: number; group_name: string | null; source: string }, source: string, groupName: string): Promise<void> {
  if (!groupName || original.group_name === groupName) return; // la mateixa notificació repetida
  try {
    const seen = await env.DB.prepare(
      "SELECT 1 FROM patrol_events WHERE kind = 'echo' AND detection_id = ? AND group_name = ? LIMIT 1",
    ).bind(original.id, groupName).first();
    if (!seen) await addPatrolEvent(env, "echo", original.id, null, source, groupName, "");
  } catch (error) {
    console.error("recordEcho failed", error);
  }
}

// Avís a què es refereix un seguiment: el darrer de la zona (6 h) o, si el missatge no
// diu zona, el darrer de tots (3 h).
async function followUpTarget(env: Env, zone: string | null): Promise<{ id: number; zone_norm: string } | null> {
  const now = Date.now();
  if (zone) {
    return await env.DB.prepare(
      "SELECT id, zone_norm FROM detections WHERE zone_norm = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1",
    ).bind(zone, new Date(now - 6 * 3600_000).toISOString()).first<{ id: number; zone_norm: string }>();
  }
  return await env.DB.prepare(
    "SELECT id, zone_norm FROM detections WHERE created_at > ? ORDER BY created_at DESC LIMIT 1",
  ).bind(new Date(now - 3 * 3600_000).toISOString()).first<{ id: number; zone_norm: string }>();
}

// Retorna el resultat per al registre d'ingest (followup_still, followup_cleared…) o null.
async function handleFollowUp(env: Env, fu: FollowUp, message: string, source: string, groupName: string): Promise<string | null> {
  const key = messageKey(message);
  // Repetits: les respostes curtes ("no", "sí") només 30 min; la resta, 12 h.
  const short = fu.kind === "yes" || fu.kind === "no";
  const since = new Date(Date.now() - (short ? 30 * 60_000 : DUPLICATE_WINDOW_MS)).toISOString();
  const prev = await env.DB.prepare(
    "SELECT raw_message FROM patrol_events WHERE created_at > ? AND kind != 'echo' ORDER BY created_at DESC LIMIT 200",
  ).bind(since).all<{ raw_message: string | null }>();
  if ((prev.results ?? []).some((r) => r.raw_message != null && messageKey(r.raw_message) === key)) return "followup_duplicate";

  if (short) {
    // Resposta a un "encara estan?" fet fa menys de 45 min (millor si és del mateix grup)
    const ask = await env.DB.prepare(`
      SELECT detection_id, zone_norm FROM patrol_events
      WHERE kind = 'ask' AND created_at > ?
      ORDER BY (group_name = ?) DESC, created_at DESC LIMIT 1
    `).bind(new Date(Date.now() - 45 * 60_000).toISOString(), groupName)
      .first<{ detection_id: number | null; zone_norm: string | null }>();
    if (!ask) return null;
    const kind = fu.kind === "yes" ? "still" : "cleared";
    await addPatrolEvent(env, kind, ask.detection_id, ask.zone_norm, source, groupName, message);
    return `followup_${kind}`;
  }

  const target = await followUpTarget(env, fu.zone_norm);
  if (!target) {
    // "Fins Escaló net" sense cap avís previ: igualment diu que la zona està neta.
    if (fu.kind === "cleared" && fu.zone_norm) {
      await addPatrolEvent(env, "cleared", null, fu.zone_norm, source, groupName, message);
      return "followup_cleared";
    }
    return null;
  }
  await addPatrolEvent(env, fu.kind, target.id, fu.zone_norm ?? target.zone_norm, source, groupName, message);
  return `followup_${fu.kind}`;
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

// Notificacions del sistema de WhatsApp/Telegram (còpies de seguretat, enviaments, etc.).
// No són missatges de cap grup: s'ignoren del tot i no apareixen a Config → Grups.
const SYSTEM_NOTIFICATION = /^(copia de seguridad|copia finalizada|c[oò]pia de seguretat|backup|eliminando|esborrant|comprobando si hay mensajes|checking for new messages|sending|enviando|enviant|descargando|subiendo|restaurando|whatsapp web)\b/i;
function isSystemNotification(title: string, text: string): boolean {
  return SYSTEM_NOTIFICATION.test(title.trim()) || SYSTEM_NOTIFICATION.test(text.trim());
}

// WhatsApp a vegades posa el comptador al títol ("Grup (3 missatges)") o el format
// "Persona @ Grup". Es neteja perquè el mateix grup no surti repetit a Config.
function normalizeGroupName(source: string, raw: string): string {
  let name = raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  if (source === "whatsapp") {
    // El títol de la notificació d'un grup porta el comptador i qui escriu:
    //   "Controlant (4 mensajes): Vilber", "Controlant: ~ Pep", "Grup (2 messages)"
    // Sense netejar-ho, cada variant es tractava com un grup nou (pendent).
    name = name.replace(/\s*\(\d+\s+[^)]*\)/gu, "").trim();
    const at = name.lastIndexOf(" @ ");
    if (at > 0) name = name.slice(at + 3).trim();
    const colon = name.indexOf(": ");
    if (colon > 0) name = name.slice(0, colon).trim();
  }
  return name.slice(0, MAX_GROUP_LENGTH);
}

// Decideix si s'han de desar els avisos d'un grup i en porta el compte.
// Grups nous: sempre pendents (cal triar "Seguir" a Config → Els meus grups).
async function groupGate(env: Env, owner: string, source: string, name: string): Promise<GroupStatus | "skip"> {
  if ((source !== "whatsapp" && source !== "telegram") || GENERIC_GROUP_NAMES.has(name.toLowerCase())) return "skip";
  const now = new Date().toISOString();
  // Tots els xats nous (WhatsApp i Telegram) queden pendents fins que algú tria "Seguir":
  // via MacroDroid també hi arriben xats privats, i no se n'ha de desar res sense permís.
  const initial: GroupStatus = "pending";
  try {
    const row = await env.DB.prepare(`
      INSERT INTO user_groups (owner, source, name, status, first_seen, last_seen, hits)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT (owner, source, name) DO UPDATE SET last_seen = excluded.last_seen, hits = hits + 1
      RETURNING status
    `).bind(owner, source, name, initial, now, now).first<{ status: GroupStatus }>();
    return row?.status ?? initial;
  } catch (error) {
    // Si la taula encara no existeix (desplegament a mitges), no bloquegis res.
    console.error("groupGate failed", error);
    return "skip";
  }
}

async function handleIngest(env: Env, req: Request): Promise<Response> {
  if (!env.INGEST_TOKEN) return json({ ok: false, reason: "INGEST_TOKEN no configurat" }, 500);
  const who = await identify(req, env, new URL(req.url));
  if (!who) {
    await logIngestHit(env, "auth_fail", "", "", "");
    return json({ ok: false, reason: "token invàlid" }, 401);
  }
  const body = await readIngestBody(req);
  if (!body) {
    await logIngestHit(env, "bad_body", "", "", "", who.id);
    return json({ ok: false, reason: "cos invàlid o massa gran" }, 400);
  }
  const message = stringValue(body.message).trim();
  if (!message) {
    await logIngestHit(env, "empty", stringValue(body.source), stringValue(body.group_name), "", who.id);
    return json({ ok: false, reason: "missatge buit" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) return json({ ok: false, reason: "missatge massa llarg" }, 413);

  const sourceRaw = stringValue(body.source).trim().toLowerCase() || "whatsapp";
  const allowedSources = new Set(["whatsapp", "telegram", "manual", "test"]);
  if (!allowedSources.has(sourceRaw)) return json({ ok: false, reason: "source no vàlid" }, 400);
  const groupName = normalizeGroupName(sourceRaw, stringValue(body.group_name));
  if (sourceRaw !== "manual" && isSystemNotification(groupName, message)) {
    await logIngestHit(env, "system", sourceRaw, groupName, "", who.id);
    return json({ ok: true, stored: false, reason: "notificació del sistema" });
  }

  const gate = await groupGate(env, who.id, sourceRaw, groupName);
  if (gate === "pending" || gate === "off") {
    // No es guarda el text: el grup no està autoritzat (pot ser un xat privat).
    await logIngestHit(env, `group_${gate}`, sourceRaw, groupName, "", who.id);
    return json({
      ok: true, stored: false, group_status: gate,
      reason: gate === "pending" ? "grup nou: activa'l a Config → Grups" : "grup desactivat a Config",
    });
  }

  // Repetits: mateix text ja desat en 12 h, de qualsevol grup (vegeu findRecentDuplicate).
  // Si arriba per un altre grup, es compta (més grups = avís més creïble).
  const original = sourceRaw !== "manual" ? await findRecentDuplicate(env, message) : null;
  if (original) {
    await recordEcho(env, original, sourceRaw, groupName);
    await logIngestHit(env, "duplicate", sourceRaw, groupName, message, who.id);
    return json({ ok: true, stored: false, duplicate: true, reason: "missatge repetit" });
  }

  const result = await storeDetection(env, message, groupName, sourceRaw);
  if (!result.stored) {
    // No és un avís nou: potser és el seguiment d'un ("segueixen", "ja han marxat"...)
    const fu = sourceRaw !== "manual" ? classifyFollowUp(message) : null;
    let outcome: string | null = null;
    if (fu) {
      try { outcome = await handleFollowUp(env, fu, message, sourceRaw, groupName); }
      catch (error) { console.error("handleFollowUp failed", error); }
    }
    await logIngestHit(env, outcome ?? "not_patrol", sourceRaw, groupName, message, who.id);
    if (outcome && outcome !== "followup_duplicate") return json({ ok: true, stored: false, follow_up: fu?.kind, outcome });
    return json({ ok: true, stored: false, reason: "no és una alerta de patrulla" });
  }
  riskCache = null;
  await logIngestHit(env, "stored", sourceRaw, groupName, message, who.id);
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
  // Xat privat amb el bot des del botó "Avisa'm per Telegram" de Benzina:
  // "/start fuel-<codi>" enllaça aquest xat amb la persona per enviar-li els avisos.
  const fuelStart = /^\/start(?:@\w+)?\s+fuel-([A-Za-z0-9_-]{2,64})$/.exec(text);
  if (fuelStart && chatId != null && chat.type === "private") {
    const code = fuelStart[1];
    const owner = code === "admin"
      ? "admin"
      : (await env.DB.prepare("SELECT id FROM users WHERE code = ? AND revoked = 0").bind(code).first<{ id: string }>())?.id;
    if (owner) {
      await env.DB.prepare(`
        INSERT INTO telegram_users (owner, chat_id, linked_at) VALUES (?, ?, ?)
        ON CONFLICT (owner) DO UPDATE SET chat_id = excluded.chat_id, linked_at = excluded.linked_at
      `).bind(owner, String(chatId), new Date().toISOString()).run();
      await sendTelegram(env, String(chatId), "✅ Fet! T'avisaré aquí quan baixi el preu de la gasolinera que has triat a PatrolTrack (de 8 a 22 h).");
    } else {
      await sendTelegram(env, String(chatId), "No t'he reconegut. Torna a tocar «Avisa'm per Telegram» des de la pestanya Benzina de PatrolTrack.");
    }
    await logTelegramHit(env, "fuel_link", { chat_id: chatId, reason: owner ?? "codi desconegut" });
    return json({ ok: true, fuel_link: !!owner });
  }
  // En afegir el bot amb l'enllaç personal (startgroup=<codi>), Telegram envia
  // "/start@bot <codi>" al grup: així sabem de qui és aquest grup.
  const startMatch = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{4,64})$/.exec(text);
  if (startMatch && chatId != null) {
    const code = startMatch[1];
    const owner = code === "admin" || code === "true"
      ? "admin"
      : (await env.DB.prepare("SELECT id FROM users WHERE code = ? AND revoked = 0").bind(code).first<{ id: string }>())?.id;
    if (owner) {
      await env.DB.prepare(`
        INSERT INTO telegram_chat_owner (chat_id, owner, assigned_at) VALUES (?, ?, ?)
        ON CONFLICT (chat_id) DO UPDATE SET owner = excluded.owner, assigned_at = excluded.assigned_at
      `).bind(String(chatId), owner, new Date().toISOString()).run();
      await logTelegramHit(env, "owner_assigned", { chat_id: chatId, chat_title: chatTitle, reason: owner });
    }
    return json({ ok: true, ignored: "start", owner: owner ?? null });
  }
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
  const chatOwner = chatId == null ? null : await env.DB.prepare("SELECT owner FROM telegram_chat_owner WHERE chat_id = ?")
    .bind(String(chatId)).first<{ owner: string }>().catch(() => null);
  const gate = await groupGate(env, chatOwner?.owner ?? "admin", "telegram", groupName);
  if (gate === "off" || gate === "pending") {
    await logTelegramHit(env, `group_${gate}`, { chat_id: chatId, chat_title: chatTitle });
    return json({ ok: true, stored: false, reason: "grup desactivat a Config" });
  }
  if (await isRecentDuplicate(env, text)) {
    await logTelegramHit(env, "duplicate", { chat_id: chatId, chat_title: chatTitle, text });
    return json({ ok: true, stored: false, duplicate: true, reason: "missatge repetit" });
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
  riskCache = null;
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

// ── Possibilitat de trobar un control (vegeu risk.ts) ─────────────────────────
// El model es calcula amb tot l'històric (180 dies) i es guarda 30 s a memòria: totes
// les pantalles de tots els mòbils el demanen sovint. Un avís nou l'invalida.
let riskCache: { at: number; model: Model } | null = null;
const RISK_TTL_MS = 30_000;
async function getRiskModel(env: Env): Promise<Model> {
  const now = Date.now();
  if (riskCache && now - riskCache.at < RISK_TTL_MS) return riskCache.model;
  const since = new Date(now - 181 * 86_400_000).toISOString();
  const [dets, events] = await Promise.all([
    env.DB.prepare(`
      SELECT id, created_at, zone_norm, patrol_type, confidence, group_name, source FROM detections
      WHERE created_at > ? AND source != 'test' ORDER BY created_at LIMIT 5000
    `).bind(since).all<DetRow>(),
    env.DB.prepare(`
      SELECT id, created_at, kind, detection_id, zone_norm, group_name FROM patrol_events
      WHERE created_at > ? ORDER BY created_at LIMIT 5000
    `).bind(since).all<EventRow>().catch(() => ({ results: [] as EventRow[] })),
  ]);
  const model = buildModel(dets.results ?? [], events.results ?? [], now);
  riskCache = { at: now, model };
  return model;
}

async function handleZoneProbs(env: Env): Promise<Response> {
  return json(zoneProbsResponse(await getRiskModel(env)));
}

async function handleProbability(env: Env, url: URL): Promise<Response> {
  const zone = url.searchParams.get("zone")?.trim();
  if (!zone) return json({ error: "zone és obligatori" }, 400);
  // Sense hour/dow: ara mateix (així el mòbil no depèn de la seva zona horària).
  const hourRaw = url.searchParams.get("hour");
  const hour = hourRaw === null || hourRaw === "" ? null : Number(hourRaw);
  if (hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) return json({ error: "hour ha de ser 0-23" }, 400);
  const dowRaw = url.searchParams.get("dow");
  const dow = dowRaw === null || dowRaw === "" ? null : Number(dowRaw);
  if (dow !== null && (!Number.isInteger(dow) || dow < 0 || dow > 6)) return json({ error: "dow ha de ser 0-6" }, 400);
  return json(probabilityResponse(await getRiskModel(env), zone, hour, dow));
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
  if (!(await identify(req, env, url))?.admin) return json({ ok: false, reason: "només l'administrador pot esborrar" }, 403);
  let parsed: unknown;
  try { parsed = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(parsed)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const groupName = stringValue(parsed.group_name).trim();
  if (!groupName) return json({ ok: false, reason: "group_name buit" }, 400);
  const [, result] = await env.DB.batch([
    env.DB.prepare("DELETE FROM patrol_events WHERE detection_id IN (SELECT id FROM detections WHERE group_name = ?)").bind(groupName),
    env.DB.prepare("DELETE FROM detections WHERE group_name = ?").bind(groupName),
  ]);
  riskCache = null;
  return json({ ok: true, deleted: result.meta?.changes ?? 0, group_name: groupName });
}

async function handleGroupSettingsList(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who) return json({ ok: false, reason: "token invàlid" }, 401);
  const { results } = await env.DB.prepare(`
    SELECT g.source, g.name, g.status, g.added_by, g.first_seen, g.last_seen, g.hits,
           (SELECT COUNT(*) FROM detections d WHERE d.group_name = g.name AND d.source = g.source) AS detections
    FROM user_groups g
    WHERE g.owner = ?
    ORDER BY CASE g.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, g.last_seen DESC
  `).bind(who.id).all();
  return json({ ok: true, groups: results });
}

async function handleGroupSettingsSave(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who) return json({ ok: false, reason: "token invàlid" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(body)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const source = stringValue(body.source).trim().toLowerCase();
  const status = stringValue(body.status).trim() || "active";
  if (source !== "whatsapp" && source !== "telegram") return json({ ok: false, reason: "origen ha de ser whatsapp o telegram" }, 400);
  if (!["active", "pending", "off"].includes(status)) return json({ ok: false, reason: "estat invàlid" }, 400);
  const name = normalizeGroupName(source, stringValue(body.name));
  if (GENERIC_GROUP_NAMES.has(name.toLowerCase()) || name.length < 2) return json({ ok: false, reason: "nom de grup invàlid" }, 400);
  const addedBy = stringValue(body.added_by).trim().slice(0, 40) || (who.admin ? null : who.name);
  await env.DB.prepare(`
    INSERT INTO user_groups (owner, source, name, status, added_by, first_seen, hits)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT (owner, source, name) DO UPDATE SET status = excluded.status,
      added_by = COALESCE(excluded.added_by, user_groups.added_by)
  `).bind(who.id, source, name, status, addedBy, new Date().toISOString()).run();
  return json({ ok: true, source, name, status });
}

async function handleGroupSettingsDelete(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who) return json({ ok: false, reason: "token invàlid" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(body)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const r = await env.DB.prepare("DELETE FROM user_groups WHERE owner = ? AND source = ? AND name = ?")
    .bind(who.id, stringValue(body.source).trim().toLowerCase(), stringValue(body.name)).run();
  return json({ ok: true, deleted: r.meta?.changes ?? 0 });
}

// Esborra un sol avís (p. ex. una notificació del sistema que es va colar). Només admin.
async function handleDetectionDelete(env: Env, req: Request, url: URL): Promise<Response> {
  if (!(await identify(req, env, url))?.admin) return json({ ok: false, reason: "només l'administrador pot esborrar" }, 403);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  const id = isRecord(body) && typeof body.id === "number" ? body.id : null;
  if (id === null) return json({ ok: false, reason: "id invàlid" }, 400);
  const [r] = await env.DB.batch([
    env.DB.prepare("DELETE FROM detections WHERE id = ?").bind(id),
    env.DB.prepare("DELETE FROM patrol_events WHERE detection_id = ?").bind(id),
  ]);
  riskCache = null;
  return json({ ok: true, deleted: r.meta?.changes ?? 0 });
}

// ── Accessos per amic ───────────────────────────────────────────────────────
async function handleMe(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who) return json({ ok: false, reason: "token invàlid" }, 401);
  return json({ ok: true, ...who });
}

async function handleUsersList(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who?.admin) return json({ ok: false, reason: "només l'administrador" }, 403);
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.name, u.created_at, u.last_seen, u.revoked,
           (SELECT COUNT(*) FROM user_groups g WHERE g.owner = u.id AND g.status = 'active') AS groups
    FROM users u ORDER BY u.revoked, u.created_at DESC
  `).all();
  return json({ ok: true, users: results });
}

// Crea l'accés d'un amic. El token només es retorna aquesta vegada (es desa el hash).
async function handleUsersCreate(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who?.admin) return json({ ok: false, reason: "només l'administrador" }, 403);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  const name = isRecord(body) ? stringValue(body.name).replace(/\s+/g, " ").trim().slice(0, 40) : "";
  if (name.length < 2) return json({ ok: false, reason: "posa el nom de l'amic" }, 400);
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE revoked = 0").first<{ n: number }>();
  if ((total?.n ?? 0) >= 50) return json({ ok: false, reason: "màxim 50 accessos" }, 429);
  const id = `u_${randomToken(6)}`;
  const token = `pt_${randomToken(24)}`;
  const code = randomToken(8);
  await env.DB.prepare("INSERT INTO users (id, name, token_hash, code, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, name, await sha256Hex(token), code, new Date().toISOString()).run();
  return json({ ok: true, id, name, token });
}

async function handleUsersRevoke(env: Env, req: Request, url: URL): Promise<Response> {
  const who = await identify(req, env, url);
  if (!who?.admin) return json({ ok: false, reason: "només l'administrador" }, 403);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  const id = isRecord(body) ? stringValue(body.id) : "";
  const r = await env.DB.prepare("UPDATE users SET revoked = 1 WHERE id = ?").bind(id).run();
  return json({ ok: true, revoked: r.meta?.changes ?? 0 });
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

// ── Avisos de benzina per Telegram (gratis) ──────────────────────────────────
// L'avís es desa amb phone = "tg:<owner>". Quan la persona toca INICIAR al bot amb
// l'enllaç t.me/<bot>?start=fuel-<codi>, el webhook guarda el seu chat a telegram_users.
const TG_PREFIX = "tg:";
let botUsernameCache: string | null = null;
async function botUsername(env: Env): Promise<string | null> {
  if (botUsernameCache) return botUsernameCache;
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const { data } = await telegramApi(env, "getMe");
    const u = isRecord(data?.result) ? stringValue((data!.result as Record<string, unknown>).username) : "";
    botUsernameCache = u || null;
  } catch { /* sense xarxa: es torna a provar la propera vegada */ }
  return botUsernameCache;
}
async function telegramChatFor(env: Env, owner: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT chat_id FROM telegram_users WHERE owner = ?").bind(owner)
    .first<{ chat_id: string }>().catch(() => null);
  return row?.chat_id ?? null;
}
async function sendTelegram(env: Env, chatId: string, text: string): Promise<{ ok: boolean; status: number; detail?: string }> {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, status: 0, detail: "bot de Telegram no configurat" };
  try {
    const { response, data } = await telegramApi(env, "sendMessage", new URLSearchParams({ chat_id: chatId, text }));
    return data?.ok ? { ok: true, status: response.status } : { ok: false, status: response.status, detail: stringValue(data?.description) };
  } catch (error) {
    return { ok: false, status: 0, detail: String(error) };
  }
}
// Envia l'avís pel canal de l'alerta: Telegram ("tg:<owner>") o SMS (telèfon)
async function sendFuelAlert(env: Env, target: string, text: string): Promise<{ ok: boolean; status: number; detail?: string }> {
  if (target.startsWith(TG_PREFIX)) {
    const chat = await telegramChatFor(env, target.slice(TG_PREFIX.length));
    return chat ? sendTelegram(env, chat, text) : { ok: false, status: 0, detail: "Telegram encara no enllaçat" };
  }
  return sendSms(env, target, text);
}
const showTarget = (t: string) => (t.startsWith(TG_PREFIX) ? "Telegram" : maskPhone(t));

function fuelSmsText(name: string, town: string, fuel: string, price: number, reason: string): string {
  return `PatrolTrack: ${FUEL_LABELS[fuel] ?? fuel} a ${name} (${town}) ara ${price.toFixed(3).replace(".", ",")} EUR. ${reason}`;
}

async function handleFuelAlertCreate(env: Env, req: Request, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const who = await identify(req, env, url);
  if (!who) return json({ ok: false, reason: "token invàlid (configura'l a la pestanya Config)" }, 401);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!isRecord(body)) return json({ ok: false, reason: "cos invàlid" }, 400);
  const viaTelegram = stringValue(body.channel) === "telegram";
  const phone = viaTelegram ? `${TG_PREFIX}${who.id}` : normalizePhone(stringValue(body.phone));
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
    // Els SMS costen diners: límit global. Per Telegram (gratis), límit ampli.
    const total = await env.DB.prepare(
      viaTelegram ? "SELECT COUNT(*) AS n FROM fuel_alerts WHERE phone LIKE 'tg:%'" : "SELECT COUNT(*) AS n FROM fuel_alerts WHERE phone NOT LIKE 'tg:%'",
    ).first<{ n: number }>();
    const max = viaTelegram ? 300 : MAX_FUEL_ALERTS;
    if ((total?.n ?? 0) >= max) return json({ ok: false, reason: `màxim ${max} avisos` }, 429);
  }
  await env.DB.prepare(`
    INSERT INTO fuel_alerts (phone, station_id, station_name, fuel, target, last_price, target_hit, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT (phone, station_id, fuel) DO UPDATE SET
      target = excluded.target, last_price = excluded.last_price, station_name = excluded.station_name, target_hit = 0
  `).bind(phone, stationId, `${st.name} (${st.town})`, fuel, target, price, new Date().toISOString()).run();

  // SMS de confirmació: comprova de seguida que l'enviament funciona.
  const reason = target ? `Avis actiu: t'escriurem si baixa o passa per sota de ${target.toFixed(3).replace(".", ",")}.` : "Avis actiu: t'escriurem quan baixi.";
  if (viaTelegram) {
    const chat = await telegramChatFor(env, who.id);
    if (!chat) {
      const bot = await botUsername(env);
      return json({ ok: true, channel: "telegram", telegram_linked: false, price,
        bot_url: bot ? `https://t.me/${bot}?start=fuel-${who.code}` : null });
    }
    const tg = await sendTelegram(env, chat, `⛽ ${fuelSmsText(st.name, st.town, fuel, price, reason)}`);
    return json({ ok: true, channel: "telegram", telegram_linked: true, price, sent: tg.ok, error: tg.ok ? undefined : tg.detail });
  }
  const sms = await sendSms(env, phone, fuelSmsText(st.name, st.town, fuel, price, reason));
  return json({ ok: true, phone: maskPhone(phone), price, sms_sent: sms.ok, sms_error: sms.ok ? undefined : (sms.detail || `HTTP ${sms.status}`) });
}

async function handleFuelAlertList(env: Env, req: Request, url: URL): Promise<Response> {
  if (!(await identify(req, env, url))) return json({ ok: false, reason: "token invàlid" }, 401);
  const { results } = await env.DB.prepare(
    "SELECT id, phone, station_id, station_name, fuel, target, last_price, last_sent_at FROM fuel_alerts ORDER BY id DESC",
  ).all<{ phone: string }>();
  return json({ ok: true, sms_configured: Boolean(env.BIRD_API_KEY), alerts: results.map((a) => ({ ...a, phone: showTarget(a.phone) })) });
}

async function handleFuelAlertDelete(env: Env, req: Request, url: URL): Promise<Response> {
  if (!(await identify(req, env, url))) return json({ ok: false, reason: "token invàlid" }, 401);
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
        const r = await sendFuelAlert(env, a.phone, (a.phone.startsWith(TG_PREFIX) ? "⛽ " : "") + fuelSmsText(st.name, st.town, a.fuel, now, reason));
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
      if (req.method === "GET" && url.pathname === "/api/zone-probs") return await handleZoneProbs(env);
      if (req.method === "GET" && url.pathname === "/api/ingest-check") return await handleIngestCheck(env, req, url);
      if (req.method === "POST" && url.pathname === "/api/ingest") return await handleIngest(env, req);
      if (req.method === "GET" && url.pathname === "/api/ingest-fingerprint") return await handleIngestFingerprint(env);
      if (req.method === "GET" && url.pathname === "/api/groups") return await handleGroups(env);
      if (req.method === "POST" && url.pathname === "/api/detections/delete") return await handleDetectionDelete(env, req, url);
      if (req.method === "GET" && url.pathname === "/api/me") return await handleMe(env, req, url);
      if (req.method === "GET" && url.pathname === "/api/users") return await handleUsersList(env, req, url);
      if (req.method === "POST" && url.pathname === "/api/users") return await handleUsersCreate(env, req, url);
      if (req.method === "POST" && url.pathname === "/api/users/revoke") return await handleUsersRevoke(env, req, url);
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
