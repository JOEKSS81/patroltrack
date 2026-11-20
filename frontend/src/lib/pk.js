// Punt quilomètric aproximat d'un punt del mapa, amb la taula oficial de PK
// (CartoCiudad/IGN) de les carreteres principals de la província de Lleida.
// Entre dos PK consecutius s'interpola en línia recta: error típic de ±0,3 km.
import PK_DATA from "../data/pk-lleida.json";

export const PK_ROADS = PK_DATA.roads; // { "C-14": [[km, lat, lng, municipi], ...], ... }

// Nom de la carretera tal com el fa servir l'app (zones del filtre de missatges).
const ROAD_TO_ZONE = { "C-1412B": "C-1412" };
export const roadToZone = (road) => ROAD_TO_ZONE[road] || road;

export const cleanMuni = (m) => (m || "").replace(/"/g, "'");

// Projecció local en metres (equirectangular): prou precisa a escala de pocs km.
function toXY(lat, lng, lat0) {
  const k = Math.PI / 180, R = 6371000;
  return [lng * k * R * Math.cos(lat0 * k), lat * k * R];
}

// Retorna { road, km, lat, lng, muni, distM } del PK més proper, o null.
// `onlyRoad` limita la cerca a una carretera; `maxDistM` descarta punts massa lluny.
export function nearestPk(lat, lng, { onlyRoad = null, maxDistM = 1500 } = {}) {
  const [px, py] = toXY(lat, lng, lat);
  let best = null;
  for (const [road, pts] of Object.entries(PK_ROADS)) {
    if (onlyRoad && road !== onlyRoad) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const [ax, ay] = toXY(a[1], a[2], lat);
      let t = 0, bx = ax, by = ay;
      // Només s'interpola entre PK veïns (si falta un PK a la taula, el tram es talla).
      if (b && b[0] - a[0] <= 2) {
        [bx, by] = toXY(b[1], b[2], lat);
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      }
      const qx = ax + t * (bx - ax), qy = ay + t * (by - ay);
      const d = Math.hypot(px - qx, py - qy);
      if (!best || d < best.distM) {
        const km = b && b[0] - a[0] <= 2 ? a[0] + t * (b[0] - a[0]) : a[0];
        best = {
          road, km, distM: d, muni: cleanMuni(t < 0.5 || !b ? a[3] : b[3]),
          lat: b && b[0] - a[0] <= 2 ? a[1] + t * (b[1] - a[1]) : a[1],
          lng: b && b[0] - a[0] <= 2 ? a[2] + t * (b[2] - a[2]) : a[2],
        };
      }
    }
  }
  return best && best.distM <= maxDistM ? best : null;
}

// Coordenades d'un PK concret (per centrar el mapa si ja s'ha escrit).
export function pkToLatLng(road, km) {
  const pts = PK_ROADS[road];
  if (!pts || !Number.isFinite(km)) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (km >= a[0] && km <= b[0] && b[0] - a[0] <= 2) {
      const t = (km - a[0]) / (b[0] - a[0] || 1);
      return { lat: a[1] + t * (b[1] - a[1]), lng: a[2] + t * (b[2] - a[2]) };
    }
  }
  const p = pts.reduce((m, x) => (Math.abs(x[0] - km) < Math.abs(m[0] - km) ? x : m), pts[0]);
  return { lat: p[1], lng: p[2] };
}

export const formatKm = (km) => `km ${km.toFixed(1).replace(".", ",")}`;
