// Genera frontend/src/data/pk-lleida.json: coordenades de cada punt quilomètric
// de les carreteres principals de la província de Lleida, a partir del geocodificador
// oficial CartoCiudad (IGN). Execució: node scripts/build-pk-table.mjs [carretera ...]
// Primer sondeja cada 10 km per trobar el tram dins la província (25) i després omple km a km.
import { readFileSync, writeFileSync } from "node:fs";

// [nom a l'app, text de cerca]. La N-II a Lleida és l'A-2 al geocodificador.
const ROADS = [
  ["A-2", "A-2"], ["A-22", "A-22"], ["N-240", "N-240"], ["N-230", "N-230"], ["N-260", "N-260"], ["N-145", "N-145"],
  ["C-12", "C-12"], ["C-13", "C-13"], ["C-14", "C-14"], ["C-25", "C-25"], ["C-26", "C-26"], ["C-28", "C-28"],
  ["C-53", "C-53"], ["C-147", "C-147"], ["C-462", "C-462"], ["C-1311", "C-1311"], ["C-1313", "C-1313"],
  ["C-1412B", "C-1412"], ["L-511", "L-511"], ["L-512", "L-512"],
];
const ONLY = process.argv.slice(2);
const MAX_KM = 620; // l'A-2 arriba a Lleida passat el km 440
const API = "https://www.cartociudad.es/geocoder/api/geocoder/candidates";

async function pk([road, query], km, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${API}?q=${encodeURIComponent(`${query} ${km}`)}&limit=15`);
      if (!r.ok) throw new Error(String(r.status));
      const txt = await r.text();
      const list = txt.trim() ? JSON.parse(txt) : [];
      const want = `${road} KM ${km} `.toUpperCase();
      const d = list.find((x) => x.provinceCode === "25" && x.portalNumber === km && x.lat
        && `${String(x.address || "").toUpperCase()} `.startsWith(want));
      if (!d) return null;
      return [Math.round(d.lat * 1e5) / 1e5, Math.round(d.lng * 1e5) / 1e5, d.muni || ""];
    } catch {
      await new Promise((res) => setTimeout(res, 500 * (t + 1)));
    }
  }
  return null;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const OUT = new URL("../frontend/src/data/pk-lleida.json", import.meta.url);
let table = {};
try { table = JSON.parse(readFileSync(OUT, "utf8")).roads || {}; } catch { /* fitxer nou */ }
for (const entry of ROADS) {
  const [road] = entry;
  if (ONLY.length && !ONLY.includes(road)) continue;
  const probes = Array.from({ length: MAX_KM / 10 + 1 }, (_, k) => k * 10);
  const hits = (await pool(probes, 6, (km) => pk(entry, km))).map((v, k) => (v ? probes[k] : null)).filter((v) => v !== null);
  if (!hits.length) { console.log(road, "— cap PK a Lleida"); continue; }
  const from = Math.max(0, Math.min(...hits) - 10), to = Math.min(MAX_KM, Math.max(...hits) + 10);
  const kms = Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const res = await pool(kms, 6, (km) => pk(entry, km));
  const pts = kms.map((km, k) => (res[k] ? [km, ...res[k]] : null)).filter(Boolean);
  table[road] = pts;
  console.log(road, `${pts.length} PK (km ${pts[0]?.[0]}–${pts.at(-1)?.[0]})`);
}
delete table["N-II"];
writeFileSync(OUT, JSON.stringify({
  source: "CartoCiudad (IGN) — geocodificador de punts quilomètrics", generated: new Date().toISOString().slice(0, 10), roads: table,
}));
