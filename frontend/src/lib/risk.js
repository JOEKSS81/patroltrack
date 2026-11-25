// Textos del model de possibilitat (/api/zone-probs i /api/probability).

export function agoText(iso) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "ara mateix";
  if (m < 60) return `fa ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `fa ${h} h ${r} min` : `fa ${h} h`;
  return `fa ${Math.round(h / 24)} dies`;
}

export function hhmm(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" });
}

export const pct = (x) => Math.round((x || 0) * 100);

const DOW = ["dg.", "dl.", "dt.", "dc.", "dj.", "dv.", "ds."];
// "dc. 25/11" (curt, perquè hi càpiga a la capçalera)
export function shortDate(d) {
  return `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
// Quan va ser un avís: "14:05" (avui), "ahir 14:05", "dt. 24/11 14:05"
export function whenText(iso) {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return hm;
  if (diff === 1) return `ahir ${hm}`;
  return `${shortDate(d)} ${hm}`;
}

// Durada en text curt: 62 → "1 h 2 min", 45 → "45 min"
export function durText(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Estat d'una zona en una frase (Inici, mapa, radar).
//   zi: risk.zones[zona]   model: risk.model
export function zoneStatus(zi, model) {
  const dur = zi?.duration_min || model?.duration_min || 60;
  if (zi?.status === "active") {
    const bits = [`avisat ${agoText(zi.started_at)}`];
    if (zi.groups > 1) bits.push(`en ${zi.groups} grups`);
    if (zi.confirmations) bits.push(plural(zi.confirmations, "confirmació", "confirmacions"));
    return {
      tone: "danger",
      title: "🔴 Control actiu",
      line: bits.join(" · "),
      hint: zi.expected_end_at ? `Sol durar ~${durText(dur)}: probablement fins a les ${hhmm(zi.expected_end_at)}` : "",
    };
  }
  if (zi?.status === "cleared") {
    return { tone: "success", title: "✅ Ja han marxat", line: `ho han dit ${agoText(zi.cleared_at)}`, hint: `Un control sol durar ~${durText(dur)}` };
  }
  return {
    tone: "neutral",
    title: "Cap avís avui",
    line: "",
    hint: `Un control sol durar ~${durText(dur)}`,
  };
}
