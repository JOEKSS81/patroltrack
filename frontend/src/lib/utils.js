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
export function playBark(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(800, now + i * 0.3);
    o.frequency.exponentialRampToValueAtTime(200, now + i * 0.3 + 0.15);
    g.gain.setValueAtTime(0.4, now + i * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.3 + 0.15);
    o.start(now + i * 0.3);
    o.stop(now + i * 0.3 + 0.15);
  }
}

// Probabilitat per zona basada en deteccions REALS (no sintètic).
// Norma per la zona més activa: 0..1 relatius a la setmana.
export function computeZoneProbs(detections) {
  const counts = {};
  MAP_ZONES.forEach(z => { counts[z.id] = 0; });
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  for (const d of detections) {
    const ts = d.created_at ? new Date(d.created_at).getTime() : 0;
    if (ts < cutoff) continue;
    const z = d.zone_norm || d.zone;
    if (z in counts) counts[z]++;
  }
  const max = Math.max(1, ...Object.values(counts));
  const p = {};
  for (const k in counts) p[k] = counts[k] / max;
  return p;
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
