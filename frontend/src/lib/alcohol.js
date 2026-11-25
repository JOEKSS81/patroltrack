// Model d'alcoholèmia (portat del simulador BioClear ToxiScan).
// Widmark amb corba d'absorció suau fins al pic i eliminació lineal del fetge.
// Conversió legal a Espanya: 1 g/L en sang ≈ 0,5 mg/L en aire espirat.

// Grams d'alcohol = ml × graduació × 0,8 (densitat de l'etanol)
export const DRINKS = [
  { id: "canya",    name: "Canya",             detail: "200 ml · 5 %",                 grams: 8.0 },
  { id: "terc",     name: "Terç / botellí",    detail: "330 ml · 5,2 %",               grams: 13.7 },
  { id: "vi",       name: "Copa de vi",        detail: "125 ml · 13 %",                grams: 13.0 },
  { id: "combinat", name: "Combinat / cubata", detail: "50 ml de destil·lat · 40 %",   grams: 16.0 },
  { id: "xupito",   name: "Xupito",            detail: "30 ml · 35 %",                 grams: 8.4 },
];

export const PRESETS = [
  { id: "feina", label: "Només 2 terços", drinks: { terc: 2 }, stomach: "empty" },
  { id: "sopar", label: "Sopar: 2 vins + copa", drinks: { vi: 2, combinat: 1 }, stomach: "full" },
  { id: "festa", label: "Nit: 3 cubates + xupito", drinks: { combinat: 3, xupito: 1 }, stomach: "empty" },
];

// Límits en aire espirat (mg/L)
export const LIMITS = { novel: 0.15, general: 0.25, crime: 0.6 };

const params = ({ sex, stomach }) => ({
  r: sex === "F" ? 0.55 : 0.68,        // factor de distribució de Widmark
  beta: sex === "F" ? 0.13 : 0.15,     // eliminació (g/L per hora)
  abs: stomach === "full" ? 0.85 : 1.0, // amb menjar se n'absorbeix menys
  tPeak: stomach === "full" ? 1.25 : 0.55, // hores fins al pic
});

// Model per dosis: cada beguda s'absorbeix seguint una corba suau fins al pic (tPeak) i el
// fetge n'elimina una quantitat fixa per hora (beta). Es calcula pas a pas (cada 1,2 min),
// així funciona igual amb tot de cop (mode comptador) o amb cada beguda a la seva hora.
//   doses: [{ t: hores des de la primera, g: grams d'alcohol }]   profile: {sex, weight, stomach}
const DT = 0.02;
export function model(doses, profile) {
  const { r, beta, abs, tPeak } = params(profile);
  const vd = profile.weight * r;
  // Mentre alguna beguda encara s'està absorbint, el model del simulador original només
  // hi resta un 40 % de l'eliminació (més prudent): amb una sola dosi dona exactament
  // la mateixa corba que el simulador BioClear.
  const absorbing = (t) => doses.some((d) => t > d.t && t - d.t < tPeak);
  const absorbed = (t) => {
    let a = 0;
    for (const d of doses) {
      const x = t - d.t;
      if (x <= 0) continue;
      a += d.g * abs * (x >= tPeak ? 1 : Math.sin((x / tPeak) * Math.PI / 2));
    }
    return a;
  };
  const lastDose = doses.reduce((m, d) => Math.max(m, d.t), 0);
  const n = Math.ceil((lastDose + 30) / DT);
  const blood = new Float64Array(n + 1);
  let prevA = 0;
  for (let k = 1; k <= n; k++) {
    const A = absorbed(k * DT);
    blood[k] = Math.max(0, blood[k - 1] + (A - prevA) / vd - beta * DT * (absorbing(k * DT) ? 0.4 : 1));
    prevA = A;
  }
  const at = (t) => {
    if (t <= 0 || !doses.length) return { blood: 0, breath: 0 };
    const i = Math.min(n - 1, Math.floor(t / DT)), f = t / DT - i;
    const b = blood[i] + (blood[i + 1] - blood[i]) * Math.min(1, Math.max(0, f));
    return { blood: b, breath: b * 0.5 };
  };
  const out = { at, peak: 0, peakBlood: 0, peakTime: 0, under: { novel: 0, general: 0, crime: 0 }, zero: 0 };
  if (!doses.some((d) => d.g > 0)) return out;
  for (let k = 0; k <= n; k++) if (blood[k] * 0.5 > out.peak) { out.peak = blood[k] * 0.5; out.peakBlood = blood[k]; out.peakTime = k * DT; }
  // Moment en què baixa per sota de cada límit DESPRÉS de l'última vegada que hi era per sobre
  for (const [key, lim] of Object.entries(LIMITS)) {
    if (out.peak < lim) continue;
    for (let k = n; k >= 0; k--) if (blood[k] * 0.5 >= lim) { out.under[key] = Math.min(n, k + 1) * DT; break; }
  }
  for (let k = n; k >= 0; k--) if (blood[k] * 0.5 > 0.004) { out.zero = Math.min(n, k + 1) * DT; break; }
  return out;
}

// Compatibilitat: tot de cop a l'hora d'inici
export function bacAt(t, grams, profile) { return model([{ t: 0, g: grams }], profile).at(t); }
export function simulate(grams, profile) { return model(grams > 0 ? [{ t: 0, g: grams }] : [], profile); }

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
