// Model d'alcoholèmia (portat del simulador BioClear ToxiScan).
// Widmark amb corba d'absorció suau fins al pic i eliminació lineal del fetge.
// Conversió legal a Espanya: 1 g/L en sang ≈ 0,5 mg/L en aire espirat.

// Grams d'alcohol = ml × graduació × 0,8 (densitat de l'etanol)
export const DRINKS = [
  { id: "canya",    name: "Canya",            detail: "200 ml · 5 %",          grams: 8.0 },
  { id: "terc",     name: "Terç / mitjana",   detail: "330 ml · 5,2 %",        grams: 13.7 },
  { id: "vi",       name: "Copa de vi",       detail: "150 ml · 13 %",         grams: 15.6 },
  { id: "combinat", name: "Combinat / cubata", detail: "70 ml de destil·lat · 40 %", grams: 22.4 },
  { id: "xupito",   name: "Xupito",           detail: "40 ml · 40 %",          grams: 12.8 },
];

export const PRESETS = [
  { id: "feina", label: "Després de la feina", drinks: { terc: 2 }, stomach: "empty" },
  { id: "sopar", label: "Sopar", drinks: { vi: 2, combinat: 1 }, stomach: "full" },
  { id: "festa", label: "Festa", drinks: { combinat: 3, xupito: 1 }, stomach: "empty" },
];

// Límits en aire espirat (mg/L)
export const LIMITS = { novel: 0.15, general: 0.25, crime: 0.6 };

const params = ({ sex, stomach }) => ({
  r: sex === "F" ? 0.55 : 0.68,        // factor de distribució de Widmark
  beta: sex === "F" ? 0.13 : 0.15,     // eliminació (g/L per hora)
  abs: stomach === "full" ? 0.85 : 1.0, // amb menjar se n'absorbeix menys
  tPeak: stomach === "full" ? 1.25 : 0.55, // hores fins al pic
});

// Taxa a l'hora t (hores des que vas començar). profile: {sex, weight, stomach}
export function bacAt(t, grams, profile) {
  if (grams <= 0 || t < 0) return { blood: 0, breath: 0 };
  const { r, beta, abs, tPeak } = params(profile);
  const maxBlood = (grams * abs) / (profile.weight * r);
  let blood;
  if (t <= tPeak) {
    blood = Math.max(0, maxBlood * Math.sin(((t / tPeak) * Math.PI) / 2) - beta * t * 0.4);
  } else {
    const peakReal = Math.max(0, maxBlood - beta * tPeak * 0.4);
    blood = Math.max(0, peakReal - beta * (t - tPeak));
  }
  return { blood, breath: blood * 0.5 };
}

const STEP = 0.05; // 3 minuts

// Pic, i quan baixa de cada límit i quan arriba a 0,00 (hores des de l'inici)
export function simulate(grams, profile) {
  const out = { grams, peak: 0, peakBlood: 0, peakTime: 0, under: { novel: 0, general: 0, crime: 0 }, zero: 0 };
  if (grams <= 0) return out;
  for (let t = 0; t <= 24; t += STEP) {
    const { blood, breath } = bacAt(t, grams, profile);
    if (breath > out.peak) { out.peak = breath; out.peakBlood = blood; out.peakTime = t; }
  }
  for (const [k, lim] of Object.entries(LIMITS)) {
    if (out.peak < lim) continue;
    for (let t = out.peakTime; t <= 30; t += STEP) {
      if (bacAt(t, grams, profile).breath < lim) { out.under[k] = t; break; }
    }
  }
  for (let t = out.peakTime; t <= 30; t += STEP) {
    if (bacAt(t, grams, profile).breath <= 0.004) { out.zero = t; break; }
  }
  return out;
}

export function fmtDur(h) {
  if (h <= 0.05) return "0 h 00 min";
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

// "22:00" + 3,5 h → "01:30 (l'endemà)"
export function clockPlus(start, h) {
  const [hh, mm] = (start || "22:00").split(":").map(Number);
  const total = Math.round(hh * 60 + mm + h * 60);
  const day = Math.floor(total / 1440);
  const n = ((total % 1440) + 1440) % 1440;
  const txt = `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return day === 1 ? `${txt} (l'endemà)` : day > 1 ? `${txt} (+${day} dies)` : txt;
}

// Hores que han passat des de l'hora d'inici (si l'hora és més tard que ara, era ahir)
export function hoursSince(start, now = new Date()) {
  const [hh, mm] = (start || "22:00").split(":").map(Number);
  let diff = (now.getHours() * 60 + now.getMinutes()) - (hh * 60 + mm);
  if (diff < 0) diff += 1440;
  return diff / 60;
}

export function level(breath) {
  if (breath >= LIMITS.crime) return "crime";
  if (breath >= LIMITS.general) return "general";
  if (breath >= LIMITS.novel) return "novel";
  return breath > 0 ? "low" : "zero";
}
