import { Fragment, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Coordenades reals de cada zona (ajusta si cal)
const ZONE_COORDS = {
  "N-II (Lleida centre)":    [41.6200, 0.6000],
  "C-13 (cap al nord)":      [41.7800, 0.8000],
  "C-14 (Ponts/Balaguer)":   [41.8500, 1.0000],
  "C-26 (Balaguer)":         [41.7900, 0.8100],
  "A-2 (autopista)":         [41.5800, 0.7200],
  "Lleida ciutat - Centre":  [41.6176, 0.6200],
  "Lleida ciutat - Cappont": [41.6100, 0.6300],
  "Lleida ciutat - Balàfia": [41.6350, 0.6300],
  "Mollerussa":              [41.6300, 0.8950],
  "Tàrrega":                 [41.6470, 1.1390],
  "Balaguer":                [41.7900, 0.8060],
  "La Seu d'Urgell":         [42.3580, 1.4590],
  "Tremp":                   [42.1660, 0.8950],
  "Cervera":                 [41.6700, 1.2720],
  "Les Borges Blanques":     [41.5220, 0.8670],
};

const SAMPLE = [
  { name: "N-II (Lleida centre)",   pct: 35, km: 7.9,  risk: false },
  { name: "Lleida ciutat - Centre", pct: 24, km: 8.2,  risk: false },
  { name: "A-2 (autopista)",        pct: 54, km: 13.3, risk: true  },
  { name: "C-26 (Balaguer)",        pct: 66, km: 22.7, risk: false },
];

function pinIcon(pct, risk) {
  const color = risk ? "#ef4444" : "#f5a623";
  return L.divIcon({
    className: "", iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32],
    html: `<div style="display:grid;place-items:center;width:34px;height:34px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};
      border:2px solid #02110f;box-shadow:0 4px 10px rgba(0,0,0,.5);font-weight:800;
      font-size:11px;color:#02110f;${risk ? "animation:ptPulse 1.6s infinite;" : ""}">
      <span style="transform:rotate(45deg)">${pct}</span></div>`,
  });
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo(target, 13, { duration: 0.8 }); }, [target, map]);
  return null;
}

export default function MapTab({ zones = SAMPLE, selected, onSelect }) {
  const target = selected && ZONE_COORDS[selected] ? ZONE_COORDS[selected] : null;
  return (
    <div style={{ height: "100%", width: "100%" }}>
      <style>{`@keyframes ptPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <MapContainer center={[41.65, 0.85]} zoom={9}
        style={{ height: "100%", width: "100%", background: "#0a0c10" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        <FlyTo target={target} />
        {zones.map((z) => {
          const c = ZONE_COORDS[z.name];
          if (!c) return null;
          return (
            <Fragment key={z.name}>
              {z.risk && (
                <Circle center={c} radius={2500}
                  pathOptions={{ color: "#ef4444", weight: 1.5, fillColor: "#ef4444", fillOpacity: 0.12 }} />
              )}
              <Marker position={c} icon={pinIcon(z.pct, z.risk)}
                eventHandlers={{ click: () => onSelect && onSelect(z.name) }}>
                <Popup>
                  <b>{z.name}</b><br />
                  Activitat: {z.pct}% · 📍 {z.km} km
                  {z.risk && <><br /><span style={{ color: "#ef4444", fontWeight: 700 }}>🚨 ZONA DE RISC</span></>}
                </Popup>
              </Marker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
