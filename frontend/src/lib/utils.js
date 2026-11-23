import { MAP_ZONES } from "./constants";

// Distància en km (haversine) entre dos punts lat/lng.
export function distKm(a1, o1, a2, o2) {
  const R = 6371;
  const d1 = (a2 - a1) * Math.PI / 180;
  const d2 = (o2 - o1) * Math.PI / 180;
  const a = Math.sin(d1 / 2) ** 2
    + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(d2 / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// So d'alerta del radar (lladruc curt). `ctx` és un AudioContext.
// Lladruc REAL (gravació) en lloc d'un so sintetitzat: el sintetitzat sonava a
// "piu piu" o a ànec. Fitxer per defecte: /bark.mp3 — "Excited barking of a hungry
// dog", triat per l'usuari (Pixabay), retallat a 2,2 s (6 lladrucs) i normalitzat.
// Cada usuari pot posar el seu propi so des del Radar ("🎵 El meu so").
export const CUSTOM_BARK_KEY = "pt_bark_custom";
const barkCache = { url: null, buf: null, loading: null };

function barkUrl() {
  try { return localStorage.getItem(CUSTOM_BARK_KEY) || "/bark.mp3"; } catch { return "/bark.mp3"; }
}

async function loadBark(ctx) {
  const url = barkUrl();
  if (barkCache.url === url && barkCache.buf) return barkCache.buf;
  if (barkCache.url === url && barkCache.loading) return barkCache.loading;
  barkCache.url = url; barkCache.buf = null;
  barkCache.loading = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { if (barkCache.url === url) barkCache.buf = buf; return buf; })
    .finally(() => { barkCache.loading = null; });
  return barkCache.loading;
}

// Pre-carrega el so (crida-ho en activar el radar perquè el primer lladruc no trigui)
export function preloadBark(ctx) { if (ctx) loadBark(ctx).catch(() => {}); }
export function resetBarkCache() { barkCache.url = null; barkCache.buf = null; }

export function playBark(ctx) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  loadBark(ctx).then((buf) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 1;
    src.connect(g); g.connect(ctx.destination);
    src.start();
  }).catch(() => {
    // Si no es pot carregar l'àudio, almenys un avís curt perquè no passi desapercebut
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = "square"; o.frequency.value = 440; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.start(t); o.stop(t + 0.4);
  });
}

// Distribució per hora de les deteccions d'una zona (normalitzada 0..1)
export function computeHourly(detections, zone) {
  const out = Array(24).fill(0);
  for (const d of detections) {
    if ((d.zone_norm || d.zone) !== zone) continue;
    if (!d.created_at) continue;
    out[new Date(d.created_at).getHours()]++;
  }
  const max = Math.max(1, ...out);
  const norm = {};
  for (let h = 0; h < 24; h++) norm[h] = out[h] / max;
  return norm;
}

// Resol les coordenades d'una detecció: reals si en té, si no usa la zona del mapa.
export function resolveDetCoords(d) {
  if (d.lat != null && d.lng != null) return { lat: d.lat, lng: d.lng, exact: true };
  const z = MAP_ZONES.find(z => z.id === (d.zone_norm || d.zone));
  if (z) return { lat: z.lat, lng: z.lng, exact: false };
  return null;
}
