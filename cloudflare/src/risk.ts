// ── Model de possibilitat de trobar un control ───────────────────────────────
//
// La idea: un control és un EPISODI que comença quan algú l'avisa i s'acaba quan algú
// diu que han marxat. Amb els episodis passats es mesura quanta estona dura un control
// (durada mitjana) i a quines hores de quins dies sol haver-n'hi a cada zona.
//
//  1. EPISODIS. Els avisos d'una mateixa zona separats menys de GAP_MIN són el mateix
//     control. Cada "segueixen" / "sí, encara hi són" n'allarga l'última evidència i cada
//     "ja han marxat" / "net" / "no" el tanca.
//  2. DURADA. Mitjana amb una base prudent (PRIOR_MEAN amb pes PRIOR_N): els episodis
//     tancats compten sencers; els que només tenen un "segueixen" compten mig, amb un
//     marge (TAIL_MIN) perquè després de l'últim "encara hi són" encara hi van estar una
//     estona. Cada zona té la seva durada, estirada cap a la general si té poques dades.
//  3. EN VIU. Si hi ha un control obert a la zona, la possibilitat que encara hi sigui
//     baixa amb el temps des de l'últim "hi són" (corba Weibull amb la durada de la zona).
//     Més grups i més confirmacions = més credibilitat.
//  4. HISTÒRIC. Quina part del temps, en aquesta franja (±WINDOW_MIN) i en aquest tipus de
//     dia (feiner / cap de setmana), hi ha hagut un control a la zona. Els dies recents
//     pesen més (HALF_LIFE_DAYS).
//  5. TOTAL = 1 − (1 − en viu) · (1 − històric).

export interface DetRow {
  id: number;
  created_at: string;
  zone_norm: string;
  patrol_type: string;
  confidence: string | null;
  group_name: string | null;
  source: string | null;
}

export interface EventRow {
  id: number;
  created_at: string;
  kind: string; // still | cleared | echo | ask
  detection_id: number | null;
  zone_norm: string | null;
  group_name: string | null;
}

export const GAP_MIN = 120;         // avisos més separats que això = controls diferents
const CLEAR_LINK_MIN = 360;         // un "ja han marxat" tanca un control obert fins a 6 h
export const PRIOR_MEAN = 60;       // base: un control dura ~1 h fins que hi hagi dades
const PRIOR_N = 3;                  // ... amb el pes de 3 controls mesurats
const ZONE_K = 3;                   // pes de la durada general dins la de cada zona
const TAIL_MIN = 20;                // marge després de l'últim "encara hi són"
const MIN_DUR = 5;
const MAX_DUR = 8 * 60;
const SHAPE = 1.5;                  // Weibull: com més estona fa, més probable que plegin
const GAMMA_1_PLUS_1_OVER_SHAPE = 0.9027; // Γ(1 + 1/1.5)
const HALF_LIFE_DAYS = 30;
const WINDOW_MIN = 45;              // franja de ±45 min al voltant de l'hora consultada
const MIN_SPAN_DAYS = 7;            // mai menys d'una setmana d'observació (evita 100% falsos)
const MAX_GAP_DAYS = 21;            // un buit més llarg = abans no es recollien dades
const MAX_HISTORY_DAYS = 180;
const LIVE_MAX_MIN = 6 * 60;
const OTHER_DAYTYPE_WEIGHT = 0.5;
const CONF_WEIGHT: Record<string, number> = { alta: 0.9, mitja: 0.8, baixa: 0.55 };
const DAY = 86_400_000;
const MIN = 60_000;

// ── Hora local (Europe/Madrid) ──
const FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function localTime(t: number): { mod: number; dow: number } {
  let hour = 0, minute = 0, dow = 0;
  for (const p of FMT.formatToParts(new Date(t))) {
    if (p.type === "hour") hour = Number(p.value) % 24;
    else if (p.type === "minute") minute = Number(p.value);
    else if (p.type === "weekday") dow = DOW[p.value] ?? 0;
  }
  return { mod: hour * 60 + minute, dow };
}
const isWeekend = (dow: number) => dow === 0 || dow === 6;

// ── Episodis ──
export interface Episode {
  zone: string;
  type: string;
  start: number;
  lastEv: number;
  end: number | null;
  reports: number;
  stills: number;
  echoes: number;
  groups: Set<string>;
  conf: number;
  detIds: number[];
  startMod: number;  // minut del dia (hora local) de l'inici
  startDow: number;
}

const ts = (iso: string) => Date.parse(iso);

export function credibility(ep: Episode): number {
  const extraGroups = Math.max(0, ep.groups.size - 1);
  const confirmations = Math.max(0, ep.reports - 1) + ep.stills;
  const c = 1 - (1 - ep.conf) * Math.pow(0.75, extraGroups) * Math.pow(0.5, confirmations);
  return Math.min(0.99, Math.max(0, c));
}

export function buildEpisodes(dets: DetRow[], events: EventRow[]): {
  episodes: Episode[];
  byDet: Map<number, Episode>;
  zoneClears: Map<string, number>;
} {
  const detById = new Map(dets.map((d) => [d.id, d]));
  type Item = { t: number; kind: "report" | "still" | "cleared"; det?: DetRow; group?: string | null };
  const timelines = new Map<string, Item[]>();
  const push = (zone: string, item: Item) => {
    if (!timelines.has(zone)) timelines.set(zone, []);
    timelines.get(zone)!.push(item);
  };
  for (const d of dets) {
    const t = ts(d.created_at);
    if (Number.isFinite(t)) push(d.zone_norm || "Desconeguda", { t, kind: "report", det: d });
  }
  for (const e of events) {
    if (e.kind !== "still" && e.kind !== "cleared") continue;
    const t = ts(e.created_at);
    const zone = e.zone_norm || (e.detection_id != null ? detById.get(e.detection_id)?.zone_norm : null);
    if (Number.isFinite(t) && zone) push(zone, { t, kind: e.kind, group: e.group_name });
  }

  const episodes: Episode[] = [];
  const byDet = new Map<number, Episode>();
  const zoneClears = new Map<string, number>();
  for (const [zone, items] of timelines) {
    items.sort((a, b) => a.t - b.t || (a.kind === "report" ? -1 : 1));
    let cur: Episode | null = null;
    for (const it of items) {
      const open = cur && cur.end == null ? cur : null;
      if (it.kind === "report") {
        const d = it.det!;
        if (open && it.t - open.lastEv <= GAP_MIN * MIN) {
          open.reports++;
          open.lastEv = Math.max(open.lastEv, it.t);
          open.conf = Math.max(open.conf, CONF_WEIGHT[d.confidence ?? ""] ?? 0.7);
          if (open.type === "unknown" && d.patrol_type !== "unknown") open.type = d.patrol_type;
          open.groups.add(`${d.source ?? ""}:${d.group_name ?? ""}`);
          open.detIds.push(d.id);
          byDet.set(d.id, open);
        } else {
          cur = {
            zone, type: d.patrol_type || "unknown", start: it.t, lastEv: it.t, end: null,
            reports: 1, stills: 0, echoes: 0, groups: new Set([`${d.source ?? ""}:${d.group_name ?? ""}`]),
            conf: CONF_WEIGHT[d.confidence ?? ""] ?? 0.7, detIds: [d.id],
            startMod: 0, startDow: 0,
          };
          const l = localTime(it.t);
          cur.startMod = l.mod;
          cur.startDow = l.dow;
          episodes.push(cur);
          byDet.set(d.id, cur);
        }
      } else if (it.kind === "still") {
        if (open && it.t - open.lastEv <= GAP_MIN * MIN) {
          open.stills++;
          open.lastEv = Math.max(open.lastEv, it.t);
        }
      } else if (open && it.t - open.lastEv <= CLEAR_LINK_MIN * MIN) {
        open.end = Math.max(it.t, open.lastEv);
      } else {
        zoneClears.set(zone, Math.max(zoneClears.get(zone) ?? 0, it.t));
      }
    }
  }
  // Un mateix avís copiat a un altre grup: més gent l'ha vist, més creïble.
  for (const e of events) {
    if (e.kind !== "echo" || e.detection_id == null) continue;
    const ep = byDet.get(e.detection_id);
    if (!ep) continue;
    ep.echoes++;
    ep.groups.add(`echo:${e.group_name ?? e.id}`);
  }
  episodes.sort((a, b) => a.start - b.start);
  return { episodes, byDet, zoneClears };
}

// ── Durada ──
const observed = (ep: Episode) => Math.min(MAX_DUR, Math.max(0, (ep.lastEv - ep.start) / MIN));
const completeDur = (ep: Episode) => Math.min(MAX_DUR, Math.max(MIN_DUR, ((ep.end ?? ep.lastEv) - ep.start) / MIN));

function durationSums(eps: Episode[]): { sum: number; weight: number; complete: number; partial: number } {
  let sum = 0, weight = 0, complete = 0, partial = 0;
  for (const ep of eps) {
    if (ep.end != null) { sum += completeDur(ep); weight += 1; complete++; }
    else if (observed(ep) >= 5) { sum += 0.5 * (observed(ep) + TAIL_MIN); weight += 0.5; partial++; }
  }
  return { sum, weight, complete, partial };
}

export interface DurationModel {
  global: number;
  complete: number;
  partial: number;
  zones: Map<string, { minutes: number; complete: number; partial: number }>;
}

export function durationModel(episodes: Episode[]): DurationModel {
  const g = durationSums(episodes);
  const global = (PRIOR_MEAN * PRIOR_N + g.sum) / (PRIOR_N + g.weight);
  const byZone = new Map<string, Episode[]>();
  for (const ep of episodes) {
    if (ep.zone === "Desconeguda") continue;
    if (!byZone.has(ep.zone)) byZone.set(ep.zone, []);
    byZone.get(ep.zone)!.push(ep);
  }
  const zones = new Map<string, { minutes: number; complete: number; partial: number }>();
  for (const [zone, eps] of byZone) {
    const z = durationSums(eps);
    zones.set(zone, { minutes: (global * ZONE_K + z.sum) / (ZONE_K + z.weight), complete: z.complete, partial: z.partial });
  }
  return { global, complete: g.complete, partial: g.partial, zones };
}

// Possibilitat que un control que es va veure a `lastEv` encara hi sigui a `now`
// (Weibull de forma SHAPE i mitjana `meanMin`, condicionada a seguir-hi a lastEv).
export function stillThere(ep: Episode, now: number, meanMin: number): number {
  if (ep.end != null || now - ep.lastEv > LIVE_MAX_MIN * MIN) return 0;
  const scale = meanMin / GAMMA_1_PLUS_1_OVER_SHAPE;
  const age = Math.max(0, (now - ep.start) / MIN);
  const seen = Math.max(0, (ep.lastEv - ep.start) / MIN);
  return Math.exp(-(Math.pow(age / scale, SHAPE) - Math.pow(seen / scale, SHAPE)));
}

// ── Model complet ──
export interface Model {
  now: number;
  since: number;            // inici de l'observació útil
  days: number;             // dies observats
  episodes: Episode[];
  byDet: Map<number, Episode>;
  zoneClears: Map<string, number>;
  duration: DurationModel;
  exposure: Map<boolean, number>; // pes total dels dies observats (feiner / cap de setmana)
}

export function observationStart(dets: DetRow[], now: number): number {
  const times = dets.map((d) => ts(d.created_at)).filter((t) => Number.isFinite(t) && t <= now).sort((a, b) => a - b);
  let start = times[0] ?? now;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > MAX_GAP_DAYS * DAY) start = times[i];
  start = Math.max(start, now - MAX_HISTORY_DAYS * DAY);
  return Math.min(start, now - MIN_SPAN_DAYS * DAY);
}

export function buildModel(dets: DetRow[], events: EventRow[], now = Date.now()): Model {
  const since = observationStart(dets, now);
  const usable = dets.filter((d) => ts(d.created_at) >= since - DAY);
  const { episodes, byDet, zoneClears } = buildEpisodes(usable, events);
  return {
    now, since, days: Math.max(MIN_SPAN_DAYS, Math.ceil((now - since) / DAY)),
    episodes, byDet, zoneClears, duration: durationModel(episodes), exposure: new Map(),
  };
}

export const zoneDuration = (m: Model, zone: string) => m.duration.zones.get(zone)?.minutes ?? m.duration.global;

export interface Target {
  mod: number;     // minut del dia (hora local)
  dow: number;     // 0 = diumenge
  isNow: boolean;  // inclou els avisos en viu
}

export function nowTarget(now: number): Target {
  const l = localTime(now);
  return { mod: l.mod, dow: l.dow, isNow: true };
}

function overlapMinutes(s: number, e: number, ws: number, we: number): number {
  let total = 0;
  for (const shift of [-1440, 0, 1440]) {
    total += Math.max(0, Math.min(e, we + shift) - Math.max(s, ws + shift));
  }
  return total;
}

export interface ZoneProb {
  p: number;
  live: number;
  hist: number;
  liveEpisode: Episode | null;
  episodes: number;
  durationMin: number;
}

export function zoneProbability(m: Model, zone: string, target: Target, type?: string): ZoneProb {
  const dur = zoneDuration(m, zone);
  const eps = m.episodes.filter((ep) => ep.zone === zone && ep.start >= m.since - DAY && (!type || ep.type === type));

  // En viu: l'últim control de la zona (si encara pot ser-hi)
  let live = 0;
  let liveEpisode: Episode | null = null;
  const last = eps.length ? eps[eps.length - 1] : null;
  if (target.isNow && last && m.now - last.start < 12 * 60 * MIN) {
    liveEpisode = last;
    live = credibility(last) * stillThere(last, m.now, dur);
  }

  // Històric: part del temps amb control en aquesta franja i tipus de dia
  const weekendTarget = isWeekend(target.dow);
  const dayWeight = (t: number, dow: number) => {
    const age = Math.max(0, (m.now - t) / DAY);
    return Math.pow(0.5, age / HALF_LIFE_DAYS) * (isWeekend(dow) === weekendTarget ? 1 : OTHER_DAYTYPE_WEIGHT);
  };
  let exposure = m.exposure.get(weekendTarget);
  if (exposure === undefined) {
    exposure = 0;
    for (let k = 0; k < m.days; k++) {
      const t = m.now - k * DAY;
      exposure += dayWeight(t, localTime(t).dow);
    }
    m.exposure.set(weekendTarget, exposure);
  }
  let covered = 0;
  const ws = target.mod - WINDOW_MIN, we = target.mod + WINDOW_MIN;
  for (const ep of eps) {
    if (ep === liveEpisode && live > 0) continue; // ja compta a "en viu"
    const length = ep.end != null ? completeDur(ep) : Math.max(observed(ep) > 0 ? observed(ep) + TAIL_MIN : 0, dur);
    const s = ep.startMod;
    const cov = Math.min(1, overlapMinutes(s, s + length, ws, we) / (2 * WINDOW_MIN));
    if (cov > 0) covered += dayWeight(ep.start, ep.startDow) * credibility(ep) * cov;
  }
  let hist = exposure > 0 ? Math.min(0.95, covered / exposure) : 0;

  // Acaben de marxar: és poc probable que tornin a muntar-lo de seguida al mateix lloc
  const clearedAt = Math.max(m.zoneClears.get(zone) ?? 0, last?.end ?? 0);
  if (target.isNow && clearedAt && m.now - clearedAt < 3 * 60 * MIN) hist *= 0.5;

  const p = 1 - (1 - live) * (1 - hist);
  return { p, live, hist, liveEpisode, episodes: eps.length, durationMin: dur };
}

export function reliabilityLabel(episodes: number, days: number): string {
  if (!episodes) return "cap dada";
  if (episodes >= 10 && days >= 30) return "alta";
  if (episodes >= 3) return "mitja";
  return "baixa";
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);

// Resposta de /api/zone-probs: totes les zones amb dades, ara mateix.
export function zoneProbsResponse(m: Model) {
  const target = nowTarget(m.now);
  const zones: Record<string, unknown> = {};
  const names = new Set(m.episodes.map((e) => e.zone).filter((z) => z !== "Desconeguda"));
  for (const zone of names) {
    const r = zoneProbability(m, zone, target);
    const ep = r.liveEpisode && r.live >= 0.01 ? r.liveEpisode : null;
    const zoneEps = m.episodes.filter((e) => e.zone === zone);
    const lastEp = zoneEps[zoneEps.length - 1];
    const clearedAt = Math.max(m.zoneClears.get(zone) ?? 0, lastEp?.end ?? 0) || null;
    const status = ep && r.live >= 0.15 ? "active" : clearedAt && m.now - clearedAt < 3 * 60 * MIN ? "cleared" : "none";
    const z = m.duration.zones.get(zone);
    zones[zone] = {
      p: r3(r.p), live: r3(r.live), hist: r3(r.hist), status,
      started_at: ep ? iso(ep.start) : null,
      last_seen_at: ep ? iso(ep.lastEv) : null,
      cleared_at: iso(clearedAt),
      reports: ep ? ep.reports : 0,
      groups: ep ? ep.groups.size : 0,
      confirmations: ep ? ep.stills : 0,
      expected_end_at: ep && status === "active" ? iso(Math.max(m.now, ep.start + r.durationMin * MIN)) : null,
      duration_min: Math.round(r.durationMin),
      measured: z ? z.complete + z.partial : 0,
      episodes: r.episodes,
      reliability: reliabilityLabel(r.episodes, m.days),
    };
  }

  // Estat de cada avís de les darreres 12 h (per al radar i les llistes)
  const detections: Record<string, unknown> = {};
  for (const [id, ep] of m.byDet) {
    if (m.now - ep.start > 12 * 60 * MIN) continue;
    const alive = stillThere(ep, m.now, zoneDuration(m, ep.zone));
    detections[id] = {
      status: ep.end != null ? "cleared" : alive >= 0.15 ? "active" : "stale",
      p_alive: r3(ep.end != null ? 0 : alive),
      cleared_at: iso(ep.end),
      last_seen_at: iso(ep.lastEv),
    };
  }

  const recent = m.episodes.slice(-15).reverse().map((ep) => ({
    zone: ep.zone, type: ep.type,
    started_at: iso(ep.start), last_seen_at: iso(ep.lastEv), ended_at: iso(ep.end),
    duration_min: ep.end != null ? Math.round(completeDur(ep)) : null,
    min_duration_min: Math.round(observed(ep)),
    measured: ep.end != null ? "complet" : observed(ep) >= 5 ? "parcial" : "un avís",
    reports: ep.reports, groups: ep.groups.size, confirmations: ep.stills,
  }));

  const zoneDurations = [...m.duration.zones.entries()]
    .filter(([, z]) => z.complete + z.partial > 0)
    .map(([zone, z]) => ({ zone, minutes: Math.round(z.minutes), measured: z.complete + z.partial }))
    .sort((a, b) => b.measured - a.measured);

  return {
    generated_at: new Date(m.now).toISOString(),
    model: {
      duration_min: Math.round(m.duration.global),
      measured_complete: m.duration.complete,
      measured_partial: m.duration.partial,
      episodes: m.episodes.filter((e) => e.start >= m.since - DAY).length,
      observed_days: m.days,
      since: new Date(m.since).toISOString(),
    },
    zones, detections, recent, zone_durations: zoneDurations,
  };
}

// Resposta de /api/probability (pestanya Consulta i radar)
// Sense hora ni dia = ara mateix (hora de Madrid, la calcula el servidor).
export function probabilityResponse(m: Model, zone: string, hourIn: number | null, dow: number | null) {
  const nowL = localTime(m.now);
  const hour = hourIn ?? Math.floor(nowL.mod / 60);
  const day = dow ?? nowL.dow;
  const isNow = day === nowL.dow && Math.floor(nowL.mod / 60) === hour;
  const target: Target = { mod: isNow ? nowL.mod : hour * 60 + 30, dow: day, isNow };
  const all = zoneProbability(m, zone, target);
  const per = (type: string) => r3(zoneProbability(m, zone, target, type).p);
  const ep = all.liveEpisode && all.live >= 0.01 ? all.liveEpisode : null;
  return {
    zone, hour, dow: day, now: isNow,
    mossos: per("mossos"), guardia: per("guardia"), local: per("local"),
    overall: r3(all.p), live: r3(all.live), hist: r3(all.hist),
    duration_min: Math.round(all.durationMin),
    active: !!ep && all.live >= 0.15,
    started_at: ep ? iso(ep.start) : null,
    last_seen_at: ep ? iso(ep.lastEv) : null,
    reports: ep ? ep.reports : 0,
    groups: ep ? ep.groups.size : 0,
    sample_size: all.episodes,
    observed_days: m.days,
    reliability: reliabilityLabel(all.episodes, m.days),
  };
}
