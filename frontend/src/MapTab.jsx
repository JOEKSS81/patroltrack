import { Fragment, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Tema per defecte (s'usa si no es passa `theme`)
const FALLBACK = {
  bg: "#0a0c10", surface: "#111318", border: "#2a3340",
  accent: "#ffb84d", danger: "#ff5757", text: "#f5f7fb", textDim: "#b8c0cc",
};

function pinIcon(pct, risk, t) {
  const color = risk ? t.danger : t.accent;
  return L.divIcon({
    className: "", iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32],
    html: `<div style="display:grid;place-items:center;width:34px;height:34px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};
      border:2px solid ${t.bg};box-shadow:0 4px 10px rgba(0,0,0,.5);font-weight:800;
      font-size:11px;color:${t.bg};${risk ? "animation:ptPulse 1.6s infinite;" : ""}">
      <span style="transform:rotate(45deg)">${pct}</span></div>`,
  });
}

// Vola cap a la zona seleccionada (només quan canvia, no al muntar)
function FlyTo({ target }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (target) map.flyTo(target, 12, { duration: 0.8 });
  }, [target, map]);
  return null;
}

// Enquadra totes les zones al muntar
function FitAll({ points }) {
  const map = useMap();
  useEffect(() => { if (points.length) map.fitBounds(points, { padding: [30, 30] }); }, []); // eslint-disable-line
  return null;
}

export default function MapTab({
  zones = [], probs = {}, nearby = [], thresh = 0.5,
  selected, onSelect, theme = FALLBACK,
}) {
  const t = { ...FALLBACK, ...theme };
  const sel = zones.find((z) => z.id === selected);
  const target = sel ? [sel.lat, sel.lng] : null;
  const points = zones.map((z) => [z.lat, z.lng]);
  const distOf = (id) => nearby.find((n) => n.id === id)?.dist;

  return (
    <div style={{ height: "100%", width: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}` }}>
      <style>{`
        @keyframes ptPulse{0%,100%{opacity:1}50%{opacity:.4}}
        .leaflet-container{background:${t.bg};font-family:inherit}
        .leaflet-popup-content-wrapper,.leaflet-popup-tip{background:${t.surface};color:${t.text};border:1px solid ${t.border}}
        .leaflet-popup-content{margin:10px 12px;font-size:13px}
      `}</style>
      <MapContainer center={[41.95, 0.95]} zoom={8} style={{ height: "100%", width: "100%", background: t.bg }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        <FitAll points={points} />
        <FlyTo target={target} />
        {zones.map((z) => {
          const pct = Math.round((probs[z.id] || 0) * 100);
          const risk = (probs[z.id] || 0) >= thresh;
          const c = [z.lat, z.lng];
          const d = distOf(z.id);
          return (
            <Fragment key={z.id}>
              {risk && (
                <Circle center={c} radius={(z.rKm || 5) * 1000}
                  pathOptions={{ color: t.danger, weight: 1.5, fillColor: t.danger, fillOpacity: 0.12 }} />
              )}
              <Marker position={c} icon={pinIcon(pct, risk, t)}
                eventHandlers={{ click: () => onSelect && onSelect(z.id) }}>
                <Popup>
                  <b>{z.label || z.id}</b><br />
                  Activitat: {pct}%{d != null ? ` · 📍 ${d} km` : ""}
                  {risk && <><br /><span style={{ color: t.danger, fontWeight: 700 }}>🚨 ZONA DE RISC</span></>}
                </Popup>
              </Marker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
