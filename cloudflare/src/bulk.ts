// ── PROVA TEMPORAL: importar xats exportats i captures de pantalla ───────────────
// Tot el que entra per aquí es desa amb source 'import' (xat exportat de WhatsApp) o
// 'captura' (text llegit d'una captura de pantalla de l'iPhone). Així:
//   · es pot esborrar tot d'un cop (mode "undo", només admin), i
//   · per tornar a com estava n'hi ha prou de treure aquest fitxer i les 2 línies
//     que el connecten a index.ts (import + ruta /api/ingest-bulk).
// No toca cap altra part del codi: fa servir l'extractor tal com és.
import { extractPatrolInfo, classifyFollowUp, ZONE_COORDS, type FollowUp, type PatrolInfo } from "./extractor";
import type { Env } from "./index";
import { madridParts, parseScreenshot, type Msg } from "./bulkParse";

type Identity = { id: string; admin: boolean };
export type BulkDeps = {
  identify: (req: Request, env: Env, url: URL) => Promise<Identity | null>;
  notifyZone: (env: Env, zone: string, text: string) => Promise<void>;
  invalidate: () => void;
  json: (data: unknown, status?: number) => Response;
};

const MAX_BODY = 256_000;
const MAX_MESSAGES = 200;          // per petició (el mòbil envia el xat a trossos)
const MAX_AGE_MS = 200 * 86_400_000;
const DUP_MS = 12 * 3600_000;      // mateix criteri que l'ingest normal
const RISK_ROWS_CAP = 4500;        // el model llegeix 5.000 avisos (180 dies): no l'omplim
const SOURCES = ["import", "captura"] as const;
type BulkSource = typeof SOURCES[number];

// Paraules dels noms de zona ("sort", "tremp", "pobla"…): una línia curta que en diu una no és un nom
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const PLACE_WORDS = new Set(Object.keys(ZONE_COORDS).flatMap((z) => norm(z).split(/[^a-z0-9]+/)).filter((w) => w.length >= 4));
const mentionsPlace = (l: string) => norm(l).split(/[^a-z0-9]+/).some((w) => PLACE_WORDS.has(w));

const PATROL_NAMES: Record<string, string> = { mossos: "Mossos", guardia: "Guàrdia Civil", local: "Policia Local" };

function messageKey(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// ── Desa una tanda de missatges (amb la seva hora real) ─────────────────────────
type DetMem = { id: number | null; t: number; zone: string; key: string };
type EvMem = { t: number; kind: string; key: string; detection_id: number | null; zone: string | null };
type Result = { messages: number; stored: number; followups: number; duplicates: number; ignored: number; capped?: boolean; recent: { zone: string; type: string; text: string; t: number }[] };

async function processMessages(env: Env, msgs: Msg[], source: BulkSource, group: string): Promise<Result> {
  const now = Date.now();
  const res: Result = { messages: msgs.length, stored: 0, followups: 0, duplicates: 0, ignored: 0, recent: [] };
  const items = msgs
    .filter((m) => Number.isFinite(m.t) && m.t > now - MAX_AGE_MS && m.t < now + 10 * 60_000 && m.text.trim().length >= 2)
    .sort((a, b) => a.t - b.t)
    .map((m) => {
      const text = m.text.trim().slice(0, 1000);
      const info: PatrolInfo | null = extractPatrolInfo(text, "whatsapp");
      const fu: FollowUp | null = info ? null : classifyFollowUp(text);
      return { t: m.t, text, info, fu, key: messageKey(text) };
    })
    .filter((x) => x.key && (x.info || x.fu));
  res.ignored = msgs.length - items.length;
  if (!items.length) return res;

  const lo = new Date(items[0].t - DUP_MS).toISOString();
  const hi = new Date(items[items.length - 1].t + DUP_MS).toISOString();
  const [count, dets, evs] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM detections WHERE created_at > ?").bind(new Date(now - 181 * 86_400_000).toISOString()).first<{ n: number }>(),
    env.DB.prepare("SELECT id, created_at, zone_norm, raw_message FROM detections WHERE created_at BETWEEN ? AND ? LIMIT 3000").bind(lo, hi)
      .all<{ id: number; created_at: string; zone_norm: string; raw_message: string | null }>(),
    env.DB.prepare("SELECT created_at, kind, detection_id, zone_norm, raw_message FROM patrol_events WHERE created_at BETWEEN ? AND ? LIMIT 3000").bind(lo, hi)
      .all<{ created_at: string; kind: string; detection_id: number | null; zone_norm: string | null; raw_message: string | null }>(),
  ]);
  let room = RISK_ROWS_CAP - Number(count?.n ?? 0);
  const detMem: DetMem[] = (dets.results ?? []).map((d) => ({ id: d.id, t: Date.parse(d.created_at), zone: d.zone_norm, key: messageKey(d.raw_message ?? "") }));
  const evMem: EvMem[] = (evs.results ?? []).map((e) => ({ t: Date.parse(e.created_at), kind: e.kind, key: messageKey(e.raw_message ?? ""), detection_id: e.detection_id, zone: e.zone_norm }));

  // 1) Avisos nous
  const newDets: { mem: DetMem; info: PatrolInfo; text: string; t: number }[] = [];
  for (const it of items) {
    if (!it.info) continue;
    if (detMem.some((d) => d.key === it.key && Math.abs(d.t - it.t) < DUP_MS)) { res.duplicates++; continue; }
    if (room <= 0) { res.capped = true; continue; }
    room--;
    const mem: DetMem = { id: null, t: it.t, zone: it.info.zone_norm, key: it.key };
    detMem.push(mem);
    newDets.push({ mem, info: it.info, text: it.text, t: it.t });
  }
  if (newDets.length) {
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < newDets.length; i += 8) { // D1: màx. 100 paràmetres per consulta
      const rows = newDets.slice(i, i + 8);
      const vals: unknown[] = [];
      for (const r of rows) {
        const p = madridParts(r.t);
        vals.push(new Date(r.t).toISOString(), p.hour, p.dow, r.info.zone, r.info.zone_norm, r.info.patrol_type,
          source, group, r.text, r.info.confidence, r.info.lat, r.info.lng);
      }
      stmts.push(env.DB.prepare(`
        INSERT INTO detections (created_at, hour, day_of_week, zone, zone_norm, patrol_type, source, group_name, raw_message, confidence, lat, lng)
        VALUES ${rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
        RETURNING id, created_at, raw_message
      `).bind(...vals));
    }
    const out = await env.DB.batch<{ id: number; created_at: string; raw_message: string }>(stmts);
    const ids = new Map<string, number>();
    for (const r of out) for (const row of r.results ?? []) ids.set(`${row.created_at}|${row.raw_message}`, row.id);
    for (const n of newDets) {
      n.mem.id = ids.get(`${new Date(n.t).toISOString()}|${n.text}`) ?? null;
      res.stored++;
      if (n.t > now - 20 * 60_000) res.recent.push({ zone: n.info.zone_norm, type: n.info.patrol_type, text: n.text, t: n.t });
    }
  }

  // 2) Seguiments ("segueixen", "ja han marxat", "encara hi són?" + sí/no)
  const target = (t: number, zone: string | null) => {
    const win = zone ? 6 * 3600_000 : 3 * 3600_000;
    const c = detMem.filter((d) => d.t <= t && d.t > t - win && (!zone || d.zone === zone)).sort((a, b) => b.t - a.t);
    return c[0] ?? null;
  };
  const newEvs: EvMem[] = [];
  const evRaw = new Map<EvMem, string>();
  for (const it of items) {
    const fu = it.fu;
    if (!fu) continue;
    const short = fu.kind === "yes" || fu.kind === "no";
    const win = short ? 30 * 60_000 : DUP_MS;
    if (evMem.some((e) => e.kind !== "echo" && e.key === it.key && Math.abs(e.t - it.t) < win)) { res.duplicates++; continue; }
    let ev: EvMem | null = null;
    if (short) {
      const ask = evMem.filter((e) => e.kind === "ask" && e.t <= it.t && e.t > it.t - 45 * 60_000).sort((a, b) => b.t - a.t)[0];
      if (ask) ev = { t: it.t, kind: fu.kind === "yes" ? "still" : "cleared", key: it.key, detection_id: ask.detection_id, zone: ask.zone };
    } else {
      const tg = target(it.t, fu.zone_norm);
      if (tg) ev = { t: it.t, kind: fu.kind, key: it.key, detection_id: tg.id, zone: fu.zone_norm ?? tg.zone };
      else if (fu.kind === "cleared" && fu.zone_norm) ev = { t: it.t, kind: "cleared", key: it.key, detection_id: null, zone: fu.zone_norm };
    }
    if (!ev) { res.ignored++; continue; }
    evMem.push(ev);
    newEvs.push(ev);
    evRaw.set(ev, it.text);
  }
  if (newEvs.length) {
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < newEvs.length; i += 14) {
      const rows = newEvs.slice(i, i + 14);
      const vals: unknown[] = [];
      for (const e of rows) vals.push(new Date(e.t).toISOString(), e.kind, e.detection_id, e.zone, source, group, evRaw.get(e) ?? "");
      stmts.push(env.DB.prepare(`
        INSERT INTO patrol_events (created_at, kind, detection_id, zone_norm, source, group_name, raw_message)
        VALUES ${rows.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}
      `).bind(...vals));
    }
    await env.DB.batch(stmts);
    res.followups = newEvs.filter((e) => e.kind !== "ask").length;
  }
  return res;
}

// ── Ruta /api/ingest-bulk ──────────────────────────────────────────────────────
//   { mode: "history",    group_name, messages: [{ t: ISO, text }] }   xat exportat (a trossos)
//   { mode: "screenshot", text, group_name? }                          text d'una captura
//   { mode: "status" }                                                 quants n'hi ha d'importats
//   { mode: "undo" }                                                   esborra tot l'importat (admin)
export async function handleBulkIngest(env: Env, req: Request, ctx: ExecutionContext, deps: BulkDeps): Promise<Response> {
  const { json } = deps;
  const who = await deps.identify(req, env, new URL(req.url));
  if (!who) return json({ ok: false, reason: "token invàlid" }, 401);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false, reason: "massa gran" }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, reason: "massa gran" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, reason: "JSON invàlid" }, 400); }
  if (!body || typeof body !== "object") return json({ ok: false, reason: "cos invàlid" }, 400);
  const mode = String(body.mode ?? "");
  const group = String(body.group_name ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

  if (mode === "status" || mode === "undo") {
    if (mode === "undo") {
      if (!who.admin) return json({ ok: false, reason: "només l'administrador" }, 403);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM patrol_events WHERE source IN ('import', 'captura')"),
        env.DB.prepare("DELETE FROM detections WHERE source IN ('import', 'captura')"),
      ]);
      deps.invalidate();
    }
    const rs = await env.DB.prepare("SELECT source, COUNT(*) AS n FROM detections WHERE source IN ('import', 'captura') GROUP BY source").all<{ source: string; n: number }>();
    const by = Object.fromEntries((rs.results ?? []).map((r) => [r.source, r.n]));
    return json({ ok: true, import: by.import ?? 0, captura: by.captura ?? 0, admin: who.admin });
  }

  let msgs: Msg[];
  let source: BulkSource;
  if (mode === "history") {
    if (!Array.isArray(body.messages)) return json({ ok: false, reason: "falten missatges" }, 400);
    if (body.messages.length > MAX_MESSAGES) return json({ ok: false, reason: `màxim ${MAX_MESSAGES} per petició` }, 413);
    msgs = body.messages.map((m: { t?: unknown; text?: unknown }) => ({ t: Date.parse(String(m?.t ?? "")), text: String(m?.text ?? "") }));
    source = "import";
  } else if (mode === "screenshot") {
    const text = String(body.text ?? "");
    if (!text.trim()) return json({ ok: false, reason: "text buit" }, 400);
    msgs = parseScreenshot(text.slice(0, 20_000), Date.now(), mentionsPlace).slice(-MAX_MESSAGES);
    source = "captura";
    // Previsualització (botó + de l'app): què s'hi ha trobat, sense desar res
    if (body.preview === true) {
      const fmt = new Intl.DateTimeFormat("ca-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
      const found = msgs.flatMap((m) => {
        const info = extractPatrolInfo(m.text, "whatsapp");
        const fu = info ? null : classifyFollowUp(m.text);
        if (!info && !fu) return [];
        return [{
          kind: info ? "alert" : fu!.kind, when: fmt.format(new Date(m.t)), text: m.text.slice(0, 160),
          zone: info?.zone_norm ?? fu?.zone_norm ?? null, type: info ? (PATROL_NAMES[info.patrol_type] ?? "Control") : null,
        }];
      });
      return json({ ok: true, preview: true, messages: msgs.length, found });
    }
  } else {
    return json({ ok: false, reason: "mode desconegut" }, 400);
  }

  const r = await processMessages(env, msgs, source, group || (source === "captura" ? "Captura" : "Xat importat"));
  if (r.stored || r.followups) deps.invalidate();
  // Avisos de fa menys de 20 min: com un avís normal, s'envien per Telegram a qui segueix la zona
  for (const d of r.recent) {
    if (!d.zone || d.zone === "Desconeguda") continue;
    const hhmm = new Intl.DateTimeFormat("ca-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(d.t));
    ctx.waitUntil(deps.notifyZone(env, d.zone, `🔴 ${PATROL_NAMES[d.type] ?? "Control"} a ${d.zone} (${hhmm})\n«${d.text.slice(0, 200)}»\nhttps://patroltrack.pages.dev`));
  }
  const summary = r.messages === 0
    ? "No he trobat cap missatge amb hora a la captura"
    : `${r.stored} avisos nous · ${r.followups} seguiments · ${r.duplicates} ja hi eren`;
  return json({ ok: true, ...r, recent: r.recent.length, summary });
}
