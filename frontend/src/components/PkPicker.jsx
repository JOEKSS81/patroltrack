import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useC } from "../lib/themes";
import { PK_ROADS, nearestPk, pkToLatLng, formatKm, roadToZone } from "../lib/pk";

// Finestra amb un mapa: toques un punt de la carretera i et diu quina carretera és,
// el punt quilomètric aproximat i el municipi. "Fer servir" l'omple a Consulta.
const ZONE_TO_ROAD = { "C-1412": "C-1412B", "N-II": "A-2" };

// Trams continus de cada carretera (es talla on falten PK a la taula).
function roadLines(pts) {
  const lines = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && pts[i][0] - pts[i - 1][0] > 2) { if (cur.length > 1) lines.push(cur); cur = []; }
    cur.push([pts[i][1], pts[i][2]]);
  }
  if (cur.length > 1) lines.push(cur);
  return lines;
}

function ClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FitTo({ bounds, center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 14);
    else if (bounds) map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, bounds, center]);
  return null;
}

export default function PkPicker({ zone, pkText, onUse, onClose }) {
  const C = useC();
  const initialRoad = PK_ROADS[ZONE_TO_ROAD[zone] || zone] ? (ZONE_TO_ROAD[zone] || zone) : null;
  const [onlyRoad, setOnlyRoad] = useState(initialRoad);
  const [pick, setPick] = useState(null);     // punt tocat
  const [result, setResult] = useState(null); // PK trobat
  const [miss, setMiss] = useState(false);
  const [locating, setLocating] = useState(false);

  const lines = useMemo(() => Object.entries(PK_ROADS).map(([road, pts]) => ({ road, segs: roadLines(pts) })), []);

  // Centre inicial: el PK ja escrit, la carretera triada o tota la província.
  const { bounds, center } = useMemo(() => {
    const km = Number(String(pkText || "").replace(/[^\d,.]/g, "").replace(",", "."));
    if (initialRoad && km) { const p = pkToLatLng(initialRoad, km); if (p) return { center: [p.lat, p.lng] }; }
    const pts = initialRoad ? PK_ROADS[initialRoad] : Object.values(PK_ROADS).flat();
    const lats = pts.map((p) => p[1]), lngs = pts.map((p) => p[2]);
    return { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] };
  }, [initialRoad, pkText]);

  const choose = (lat, lng) => {
    setPick([lat, lng]);
    const r = nearestPk(lat, lng, { onlyRoad, maxDistM: onlyRoad ? 3000 : 1500 });
    setResult(r); setMiss(!r);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); choose(p.coords.latitude, p.coords.longitude); },
      () => { setLocating(false); setMiss(true); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const btn = (bg, fg, border) => ({ background: bg, color: fg, border: border || "none", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9950, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: C.surface, borderRadius: "16px 16px 0 0", border: `1px solid ${C.border}`, padding: 12, paddingBottom: "max(12px, env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.accent }}>📍 Toca un punt de la carretera</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
          <select value={onlyRoad || ""} onChange={(e) => { setOnlyRoad(e.target.value || null); setResult(null); setPick(null); setMiss(false); }}
            style={{ flex: 1, padding: "8px 10px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit" }}>
            <option value="">Totes les carreteres</option>
            {Object.keys(PK_ROADS).sort().map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={useMyLocation} style={{ ...btn("transparent", C.accent, `1px solid ${C.accent}`), padding: "8px 10px", fontSize: 12 }}>{locating ? "…" : "🎯 On sóc"}</button>
        </div>

        <div style={{ height: "52vh", minHeight: 280, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
          <MapContainer center={[42.0, 1.1]} zoom={8} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" attribution="© Esri" maxZoom={19} />
            <FitTo bounds={bounds} center={center} />
            <ClickHandler onPick={choose} />
            {lines.map(({ road, segs }) => segs.map((seg, i) => (
              <Polyline key={`${road}-${i}`} positions={seg} interactive={false}
                pathOptions={{ color: onlyRoad === road ? C.accent : "#2563eb", weight: onlyRoad === road ? 6 : 3, opacity: onlyRoad && onlyRoad !== road ? 0.25 : 0.8 }} />
            )))}
            {pick && <CircleMarker center={pick} radius={5} pathOptions={{ color: "#fff", fillColor: "#64748b", fillOpacity: 1, weight: 1 }} />}
            {result && <CircleMarker center={[result.lat, result.lng]} radius={9} pathOptions={{ color: "#fff", fillColor: C.danger, fillOpacity: 1, weight: 3 }} />}
          </MapContainer>
        </div>

        <div style={{ minHeight: 64, marginTop: 10 }}>
          {result ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{result.road} · {formatKm(result.km)}</div>
                <div style={{ fontSize: 12, color: C.textDim }}>{result.muni} · aproximat (±0,3 km){result.distM > 300 ? ` · el punt era a ${Math.round(result.distM)} m de la via` : ""}</div>
              </div>
              <button onClick={() => onUse({ zone: roadToZone(result.road), pk: formatKm(result.km), muni: result.muni })} style={btn(C.accent, C.bg)}>Fer servir</button>
            </div>
          ) : miss ? (
            <div style={{ fontSize: 13, color: C.warning }}>No hi ha cap carretera de la llista a prop d'aquest punt. Toca damunt d'una línia blava (o tria "Totes les carreteres").</div>
          ) : (
            <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>Fes zoom i toca la carretera (línies blaves). També pots tocar <b>🎯 On sóc</b> si hi ets ara mateix.</div>
          )}
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>PK oficials: CartoCiudad (IGN). Carreteres principals de la província de Lleida.</div>
      </div>
    </div>
  );
}
