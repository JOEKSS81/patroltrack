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
// Lladruc de gos sintetitzat ("guau guau guau"), sense fitxers d'àudio.
// Cada lladruc: veu greu en dent de serra que puja i baixa de to (≈260→520→300 Hz),
// un filtre que obre i tanca com la vocal "w-a-w", una mica de soroll per a la
// ronquera i distorsió suau. Tres lladrucs amb petites variacions perquè soni viu.
export function playBark(ctx) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  // Distorsió suau (to "gruixut" de gos gran)
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(2.4 * x); }
  shaper.curve = curve;
  shaper.connect(out); out.connect(ctx.destination);

  // Soroll blanc curt per a l'aire/ronquera
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const barks = [
    { at: 0.00, f: 1.00, len: 0.20 },
    { at: 0.30, f: 1.06, len: 0.18 },
    { at: 0.58, f: 0.95, len: 0.24 },
  ];
  for (const b of barks) {
    const t = t0 + b.at, end = t + b.len;
    // Veu: dent de serra + subharmònic (pes del pit)
    const vox = ctx.createOscillator(); vox.type = "sawtooth";
    vox.frequency.setValueAtTime(260 * b.f, t);
    vox.frequency.exponentialRampToValueAtTime(520 * b.f, t + 0.045);
    vox.frequency.exponentialRampToValueAtTime(300 * b.f, end);
    const sub = ctx.createOscillator(); sub.type = "triangle";
    sub.frequency.setValueAtTime(130 * b.f, t);
    sub.frequency.exponentialRampToValueAtTime(260 * b.f, t + 0.045);
    sub.frequency.exponentialRampToValueAtTime(150 * b.f, end);
    // Vocal "w-a-w": el filtre s'obre i es tanca
    const formant = ctx.createBiquadFilter(); formant.type = "bandpass"; formant.Q.value = 1.6;
    formant.frequency.setValueAtTime(500, t);
    formant.frequency.exponentialRampToValueAtTime(1500, t + 0.05);
    formant.frequency.exponentialRampToValueAtTime(650, end);
    const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 2600;
    // Envolupant: atac sec, caiguda ràpida
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.85, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.35, t + 0.09);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    const subG = ctx.createGain(); subG.gain.value = 0.5;
    // Soroll filtrat
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuf;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1800; nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    vox.connect(formant); sub.connect(subG); subG.connect(formant);
    formant.connect(body); body.connect(env); env.connect(shaper);
    noise.connect(nf); nf.connect(ng); ng.connect(shaper);
    vox.start(t); sub.start(t); noise.start(t);
    vox.stop(end + 0.02); sub.stop(end + 0.02); noise.stop(t + 0.13);
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
