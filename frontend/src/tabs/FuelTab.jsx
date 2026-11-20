import { useEffect, useMemo, useState, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";

// Preus de carburants a la província de Lleida (dades obertes del Ministeri).
// Font principal: el Worker (/api/fuel, amb memòria cau de 30 min).
// Si el Worker falla, es llegeix directament del Ministeri (té CORS obert).
const MINISTRY_URL =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/25";
const FUEL_FIELDS = {
  g95: "Precio Gasolina 95 E5",
  g98: "Precio Gasolina 98 E5",
  diesel: "Precio Gasoleo A",
  dieselp: "Precio Gasoleo Premium",
  glp: "Precio Gases licuados del petróleo",
};
const FUELS = [
  { id: "g95", label: "Gasolina 95" },
  { id: "diesel", label: "Dièsel" },
  { id: "g98", label: "Gasolina 98" },
  { id: "dieselp", label: "Dièsel+" },
];
const AREAS = [
  { id: "all", label: "Tot" },
  { id: "pirineu", label: "Pirineu" },
  { id: "ponent", label: "Ponent" },
];
// Latitud aproximada on comença el Pirineu (Organyà, Tremp, Sort, Vielha queden per sobre).
const PIRINEU_LAT = 42.0;
const REFRESH_MS = 30 * 60 * 1000;
const FAV_KEY = "pt_fuel_fav";
const PREF_KEY = "pt_fuel_prefs";

const num = (v) => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function slimMinistry(raw) {
  const stations = (raw?.ListaEESSPrecio || []).map((s) => {
    const prices = {};
    for (const [k, f] of Object.entries(FUEL_FIELDS)) {
      const p = num(s[f]);
      if (p !== null) prices[k] = p;
    }
    return {
      id: String(s.IDEESS || ""),
      name: String(s["Rótulo"] || "").trim(),
      address: String(s["Dirección"] || "").trim(),
      town: String(s.Municipio || "").trim(),
      hours: String(s.Horario || "").trim(),
      lat: num(s.Latitud),
      lng: num(s["Longitud (WGS84)"]),
      prices,
    };
  }).filter((s) => s.id && s.lat !== null && s.lng !== null && Object.keys(s.prices).length);
  return { updated: raw?.Fecha || "", count: stations.length, stations };
}

async function loadFuel() {
  try {
    const r = await fetch(`${API}/api/fuel`);
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.stations) && d.stations.length) return d;
    }
  } catch { /* prova la font directa */ }
  const r = await fetch(MINISTRY_URL);
  if (!r.ok) throw new Error(`Ministeri ${r.status}`);
  return slimMinistry(await r.json());
}

const readLS = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sense emmagatzematge */ } };

function kmBetween(a, b) {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Verd (barat) → groc → vermell (car), segons la posició dins el rang visible.
function priceColor(p, min, max) {
  const t = max > min ? (p - min) / (max - min) : 0.5;
  const hue = Math.round(120 * (1 - t));
  return `hsl(${hue} 80% 50%)`;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lng], 13, { duration: 0.6 }); }, [target, map]);
  return null;
}

const fmt = (p) => (p == null ? "—" : `${p.toFixed(3)} €`);

export default function FuelTab() {
  const C = useC();
  const prefs0 = readLS(PREF_KEY, {});
  const [fuel, setFuel] = useState(prefs0.fuel || "g95");
  const [area, setArea] = useState(prefs0.area || "all");
  const [sortBy, setSortBy] = useState("price");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fav, setFav] = useState(() => readLS(FAV_KEY, null)); // {id, fuel, lastPrice, target}
  const [drop, setDrop] = useState(null);
  const [me, setMe] = useState(null);
  const [focus, setFocus] = useState(null);

  useEffect(() => { writeLS(PREF_KEY, { fuel, area }); }, [fuel, area]);

  // Compara el preu de la gasolinera preferida amb l'últim vist i avisa si baixa.
  // Es fa en rebre les dades (no en un efecte) i llegeix la preferida de localStorage.
  const applyData = useCallback((d) => {
    setData(d);
    const f = readLS(FAV_KEY, null);
    if (!f) return;
    const st = d.stations.find((s) => s.id === f.id);
    const now = st?.prices?.[f.fuel];
    if (now == null) return;
    const dropped = f.lastPrice != null && now < f.lastPrice - 0.0005;
    const underTarget = f.target != null && now <= f.target;
    if (dropped || underTarget) {
      const msg = dropped
        ? `${st.name} (${st.town}): ${fmt(now)}, ha baixat ${((f.lastPrice - now) * 100).toFixed(1)} cèntims`
        : `${st.name} (${st.town}): ${fmt(now)}, per sota del teu objectiu`;
      setDrop(msg);
      try {
        if ("Notification" in window && Notification.permission === "granted") new Notification("⛽ Preu a la baixa", { body: msg });
      } catch { /* notificacions no disponibles */ }
    }
    if (now !== f.lastPrice) {
      const next = { ...f, lastPrice: now };
      setFav(next); writeLS(FAV_KEY, next);
    }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true); setError(null);
    return loadFuel()
      .then(applyData)
      .catch((e) => setError(e.message || "error"))
      .finally(() => setLoading(false));
  }, [applyData]);

  useEffect(() => {
    let alive = true;
    const run = () => loadFuel()
      .then((d) => { if (alive) { setError(null); applyData(d); } })
      .catch((e) => { if (alive) setError(e.message || "error"); })
      .finally(() => { if (alive) setLoading(false); });
    run();
    const t = setInterval(run, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [applyData]);

  const makeFav = (st) => {
    const next = { id: st.id, fuel, lastPrice: st.prices[fuel] ?? null, target: fav?.id === st.id ? fav.target ?? null : null };
    setFav(next); writeLS(FAV_KEY, next); setDrop(null);
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch { /* */ }
  };
  const clearFav = () => { setFav(null); writeLS(FAV_KEY, null); setDrop(null); };
  const setTarget = (v) => {
    if (!fav) return;
    const next = { ...fav, target: num(v) };
    setFav(next); writeLS(FAV_KEY, next);
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { const pos = { lat: p.coords.latitude, lng: p.coords.longitude }; setMe(pos); setSortBy("distance"); },
      () => setError("No s'ha pogut obtenir la ubicació"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const list = useMemo(() => {
    if (!data) return [];
    let l = data.stations.filter((s) => s.prices[fuel] != null);
    if (area === "pirineu") l = l.filter((s) => s.lat >= PIRINEU_LAT);
    if (area === "ponent") l = l.filter((s) => s.lat < PIRINEU_LAT);
    l = l.map((s) => ({ ...s, km: me ? kmBetween(me, s) : null }));
    l.sort(sortBy === "distance" && me ? (a, b) => a.km - b.km : (a, b) => a.prices[fuel] - b.prices[fuel]);
    return l;
  }, [data, fuel, area, me, sortBy]);

  const stats = useMemo(() => {
    const ps = list.map((s) => s.prices[fuel]);
    if (!ps.length) return null;
    const sorted = [...ps].sort((a, b) => a - b);
    return { min: sorted[0], max: sorted[sorted.length - 1], avg: ps.reduce((a, b) => a + b, 0) / ps.length };
  }, [list, fuel]);

  const favStation = fav && data ? data.stations.find((s) => s.id === fav.id) : null;

  const chip = (active) => ({
    flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
    fontSize: 12, fontWeight: 700, background: active ? C.accent : "transparent", color: active ? C.bg : C.textDim,
  });
  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8 };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, background: C.surface, padding: 4, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 6 }}>
        {FUELS.map((f) => <button key={f.id} style={chip(fuel === f.id)} onClick={() => setFuel(f.id)}>{f.label}</button>)}
      </div>
      <div style={{ display: "flex", gap: 4, background: C.surface, padding: 4, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 8 }}>
        {AREAS.map((a) => <button key={a.id} style={chip(area === a.id)} onClick={() => setArea(a.id)}>{a.label}</button>)}
        <button style={chip(sortBy === "distance")} onClick={me ? () => setSortBy(sortBy === "distance" ? "price" : "distance") : locate}>
          📍 {me ? (sortBy === "distance" ? "A prop" : "Preu") : "A prop"}
        </button>
      </div>

      {drop && (
        <div style={{ ...card, borderColor: C.success, color: C.success, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>⬇ {drop}</span>
          <button onClick={() => setDrop(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {favStation && (
        <div style={{ ...card, borderColor: C.accent }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>★ LA MEVA · {FUELS.find((f) => f.id === fav.fuel)?.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{favStation.name} · {favStation.town}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>{fmt(favStation.prices[fav.fuel])}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: C.textDim }}>
            <span>Avisa'm per sota de</span>
            <input inputMode="decimal" placeholder="1,450" defaultValue={fav.target != null ? String(fav.target).replace(".", ",") : ""}
              onBlur={(e) => setTarget(e.target.value)}
              style={{ width: 70, padding: "5px 6px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: "inherit", fontSize: 13 }} />
            <span>€</span>
            <button onClick={clearFav} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>Treure</button>
          </div>
        </div>
      )}

      {stats && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[["Mínim", stats.min, C.success], ["Mitjana", stats.avg, C.text], ["Màxim", stats.max, C.danger]].map(([l, v, col]) => (
            <div key={l} style={{ ...card, flex: 1, marginBottom: 0, textAlign: "center", padding: 8 }}>
              <div style={{ fontSize: 10, color: C.textMuted }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: col }}>{v.toFixed(3)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 300, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, marginBottom: 8 }}>
        <MapContainer center={[41.95, 1.05]} zoom={8} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" attribution="© Esri, HERE, Garmin, © OpenStreetMap" maxNativeZoom={16} maxZoom={19} />
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={16} maxZoom={19} />
          <FlyTo target={focus} />
          {me && <CircleMarker center={[me.lat, me.lng]} radius={7} pathOptions={{ color: "#fff", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 }} />}
          {stats && list.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={fav?.id === s.id ? 10 : 6}
              pathOptions={{ color: fav?.id === s.id ? C.accent : "#000", weight: fav?.id === s.id ? 3 : 1, fillColor: priceColor(s.prices[fuel], stats.min, stats.max), fillOpacity: 0.9 }}>
              <Popup>
                <b>{s.name}</b><br />{s.address}, {s.town}<br />
                {FUELS.filter((f) => s.prices[f.id] != null).map((f) => <div key={f.id}>{f.label}: <b>{fmt(s.prices[f.id])}</b></div>)}
                <div style={{ fontSize: 11, marginTop: 4 }}>{s.hours}</div>
                <button onClick={() => makeFav(s)} style={{ marginTop: 6, cursor: "pointer" }}>{fav?.id === s.id ? "★ La meva" : "☆ Fer-la meva"}</button>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {loading && !data && <div style={{ ...card, color: C.textDim, fontSize: 13 }}>Carregant preus…</div>}
      {error && <div style={{ ...card, color: C.danger, fontSize: 13 }}>⚠ {error} <button onClick={refresh} style={{ marginLeft: 6, cursor: "pointer" }}>Reintenta</button></div>}

      {list.slice(0, 40).map((s, i) => (
        <div key={s.id} onClick={() => setFocus({ lat: s.lat, lng: s.lng, k: Date.now() })}
          style={{ ...card, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderColor: fav?.id === s.id ? C.accent : C.border }}>
          <div style={{ width: 22, fontSize: 12, color: C.textMuted, textAlign: "right" }}>{i + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name || "Sense nom"}</div>
            <div style={{ fontSize: 11, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.town}{s.km != null ? ` · ${s.km.toFixed(1)} km` : ""}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: priceColor(s.prices[fuel], stats.min, stats.max) }}>{s.prices[fuel].toFixed(3)}</div>
          <button onClick={(e) => { e.stopPropagation(); fav?.id === s.id ? clearFav() : makeFav(s); }}
            style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: fav?.id === s.id ? C.accent : C.textMuted }}
            aria-label="Gasolinera preferida">{fav?.id === s.id ? "★" : "☆"}</button>
        </div>
      ))}

      {data && (
        <div style={{ fontSize: 10, color: C.textMuted, textAlign: "center", margin: "8px 0 4px" }}>
          {list.length} gasolineres · Actualitzat {data.updated} · Font: Ministeri per a la Transició Ecològica
        </div>
      )}
    </div>
  );
}
