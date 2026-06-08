import { Fragment, useEffect, useRef, useState, useMemo } from "react"; // eslint-disable-line no-unused-vars
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Tema per defecte (s'usa si no es passa `theme`)
const FALLBACK = {
  bg: "#0a0c10", surface: "#111318", border: "#2a3340",
  accent: "#ffb84d", danger: "#ff5757", text: "#f5f7fb", textDim: "#b8c0cc",
  success: "#22d97a", warning: "#ffb020",
  mossos: "#60a5fa", guardia: "#4ade80", local: "#c084fc",
};

const PT_COLOR = (t) => ({
  mossos: t.mossos || "#60a5fa",
  guardia: t.guardia || "#4ade80",
  local: t.local || "#c084fc",
  unknown: t.textDim,
});

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

function userIcon(t) {
  return L.divIcon({
    className: "", iconSize: [22, 22], iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${t.accent};
      border:3px solid #fff;box-shadow:0 0 0 2px ${t.accent}88, 0 0 12px ${t.accent};
      animation:ptUserPulse 2s infinite;"></div>`,
  });
}

// Vola cap a la zona seleccionada (només quan canvia, no al muntar)
function FlyTo({ target, zoom = 12 }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (target) map.flyTo(target, zoom, { duration: 0.8 });
  }, [target, zoom, map]);
  return null;
}

// Enquadra totes les zones al muntar
function FitAll({ points }) {
  const map = useMap();
  useEffect(() => { if (points.length) map.fitBounds(points, { padding: [30, 30] }); }, []); // eslint-disable-line
  return null;
}

// Exposa la instància del mapa al pare per poder controlar-lo des dels botons
function MapHandle({ onReady }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

// Distància en km (haversine) — local perquè el component no depengui d'App.jsx
function distKm(a1, o1, a2, o2) {
  const R = 6371, d1 = (a2 - a1) * Math.PI / 180, d2 = (o2 - o1) * Math.PI / 180;
  const a = Math.sin(d1 / 2) ** 2 + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(d2 / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Tile providers — tots gratuïts, sense API key.
// Sense `{r}` per evitar URLs malformades en navegadors que no actualitzen Leaflet:
// el placeholder {r} només es substitueix si `detectRetina` està activat al TileLayer.
const TILE_SETS = {
  dark:     { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",      attr: "© OpenStreetMap, © CARTO", label: "Fosc",        emoji: "🌑" },
  darkmin:  { url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png", attr: "© OpenStreetMap, © CARTO", label: "Fosc mínim", emoji: "⚫" },
  voyager:  { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", attr: "© OpenStreetMap, © CARTO", label: "Voyager", emoji: "🗺" },
  positron: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",     attr: "© OpenStreetMap, © CARTO", label: "Clar",        emoji: "☀" },
  osm:      { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",                attr: "© OpenStreetMap",            label: "OSM clàssic", emoji: "🌍" },
};

// Skin → tile preferit
const THEME_TO_TILE = {
  normal: "dark", terror: "dark", neon: "dark", candy: "dark",
  hacker: "darkmin", camo: "voyager",
};

export default function MapTab({
  zones = [], probs = {},
  selected, onSelect, theme = FALLBACK, themeName = "normal",
  detections = [],           // deteccions reals (per la capa 24h)
  radarPos = null,           // posició del radar si està actiu (estalvia geo)
  riskThreshold = 0.5,        // probabilitat (0..1) sobre la qual la zona es marca com a risc
}) {
  const t = { ...FALLBACK, ...theme };
  const sel = zones.find((z) => z.id === selected);
  const target = sel ? [sel.lat, sel.lng] : null;
  const points = zones.map((z) => [z.lat, z.lng]);

  const [showDets, setShowDets] = useState(true);     // capa deteccions 24h
  const [showLegend, setShowLegend] = useState(false);    // per defecte plegada, ocupa menys
  const [showTools, setShowTools] = useState(false);      // barra d'eines plegada per defecte
  const [userPos, setUserPos] = useState(null);       // {lat,lng,acc}
  const [locErr, setLocErr] = useState(null);
  const [following, setFollowing] = useState(false);  // seguiment continu
  const [mapInstance, setMapInstance] = useState(null);
  const watchRef = useRef(null);

  // Tile actiu: override de l'usuari (localStorage) o el per defecte del skin
  const [tileKey, setTileKey] = useState(() => {
    try {
      const saved = localStorage.getItem("pt_map_tile");
      if (saved && TILE_SETS[saved]) return saved;
    } catch {}
    return THEME_TO_TILE[themeName] || "dark";
  });
  // Quan canvia el skin i l'usuari no ha forçat tile, segueix el del skin
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pt_map_tile");
      if (!saved) setTileKey(THEME_TO_TILE[themeName] || "dark");
    } catch {}
  }, [themeName]);
  const setTile = (k) => {
    setTileKey(k);
    try { localStorage.setItem("pt_map_tile", k); } catch {}
  };
  const resetTile = () => {
    try { localStorage.removeItem("pt_map_tile"); } catch {}
    setTileKey(THEME_TO_TILE[themeName] || "dark");
  };
  const [showTilePicker, setShowTilePicker] = useState(false);
  const currentTile = TILE_SETS[tileKey] || TILE_SETS.dark;
  // Distància de l'usuari a una zona (per al popup)
  const distOf = (z) => userPos ? Math.round(distKm(userPos.lat, userPos.lng, z.lat, z.lng) * 10) / 10 : null;

  // Sincronitza amb la posició del radar si el radar està actiu
  useEffect(() => {
    if (radarPos) setUserPos({ lat: radarPos.lat, lng: radarPos.lng, acc: radarPos.acc });
  }, [radarPos]);

  // Deteccions de les últimes 24h amb coordenades vàlides
  const recentDets = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return detections
      .filter((d) => {
        if (d.lat == null || d.lng == null) return false;
        const ts = d.created_at ? new Date(d.created_at).getTime() : 0;
        return ts >= cutoff;
      })
      .slice(0, 100);
  }, [detections]);

  // Si no tenim coords reals al detection, intentem mapejar per zone_norm a la zona del mapa
  const recentDetsResolved = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const byZone = Object.fromEntries(zones.map((z) => [z.id, z]));
    return detections
      .filter((d) => {
        const ts = d.created_at ? new Date(d.created_at).getTime() : 0;
        return ts >= cutoff;
      })
      .map((d) => {
        if (d.lat != null && d.lng != null) return { ...d, _lat: d.lat, _lng: d.lng, _exact: true };
        const z = byZone[d.zone_norm] || byZone[d.zone];
        if (z) {
          // jitter petit per evitar overlap exacte de pins a la mateixa zona
          const j = (Math.sin(((d.id || 0) * 13) % 360) * 0.005);
          const k = (Math.cos(((d.id || 0) * 17) % 360) * 0.005);
          return { ...d, _lat: z.lat + j, _lng: z.lng + k, _exact: false };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 80);
  }, [detections, zones]);

  const [locating, setLocating] = useState(false);

  const errMsg = (e) => {
    if (!e) return "Error desconegut";
    if (e.code === 1) return "Permís d'ubicació denegat";
    if (e.code === 2) return "Posició no disponible (GPS apagat?)";
    if (e.code === 3) return "Temps esgotat — torna a provar";
    return e.message || "Error de GPS";
  };

  // Locate me — fix d'alta precisió únic. Pot trigar 5-15s al primer cop però evita el
  // bug del two-shot anterior: el fix "ràpid" en cache podia ser una posició IP/WiFi
  // a quilòmetres del lloc real (p.ex. centrava a Lleida quan eres a Sort).
  const locate = () => {
    if (!navigator.geolocation) { setLocErr("GPS no disponible al navegador"); return; }
    setLocErr(null);
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (p) => {
        const np = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setUserPos(np);
        // Zoom adaptatiu segons precisió: més fi si el GPS dona <100m
        const zoom = np.acc < 100 ? 15 : np.acc < 500 ? 13 : np.acc < 2000 ? 11 : 9;
        if (mapInstance) mapInstance.flyTo([np.lat, np.lng], zoom, { duration: 0.9 });
        setLocating(false);
      },
      (e) => {
        setLocErr(errMsg(e));
        setLocating(false);
      },
      // maximumAge:0 força un fix fresc; high accuracy força GPS quan està disponible
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };

  const toggleFollow = () => {
    if (following) {
      if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
      setFollowing(false);
      return;
    }
    if (!navigator.geolocation) { setLocErr("GPS no disponible al navegador"); return; }
    setLocErr(null);
    setFollowing(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const np = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setUserPos(np);
        if (mapInstance) mapInstance.panTo([np.lat, np.lng], { animate: true, duration: 0.6 });
      },
      (e) => { setLocErr(errMsg(e)); setFollowing(false); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  // Cleanup watch al desmuntar
  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  const fitAll = () => {
    if (mapInstance && points.length) mapInstance.fitBounds(points, { padding: [30, 30] });
  };

  const ptCol = PT_COLOR(t);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}` }}>
      <style>{`
        @keyframes ptPulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes ptUserPulse{0%,100%{box-shadow:0 0 0 2px ${t.accent}88, 0 0 12px ${t.accent}}50%{box-shadow:0 0 0 8px ${t.accent}22, 0 0 18px ${t.accent}}}
        .leaflet-container{background:${t.bg};font-family:inherit}
        .leaflet-popup-content-wrapper,.leaflet-popup-tip{background:${t.surface};color:${t.text};border:1px solid ${t.border}}
        .leaflet-popup-content{margin:10px 12px;font-size:13px}
        .pt-mapbtn{background:${t.surface};color:${t.text};border:1px solid ${t.border};border-radius:8px;padding:8px 10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,.4);transition:all .15s}
        .pt-mapbtn:hover{background:${t.bg};border-color:${t.accent}66}
        .pt-mapbtn.active{background:${t.accent};color:${t.bg};border-color:${t.accent}}
      `}</style>

      <MapContainer center={[41.95, 0.95]} zoom={8} zoomControl={false} style={{ height: "100%", width: "100%", background: t.bg }}>
        <TileLayer key={tileKey} url={currentTile.url} attribution={currentTile.attr} detectRetina={true} maxZoom={19} />
        <MapHandle onReady={setMapInstance} />
        <FitAll points={points} />
        <FlyTo target={target} />

        {/* Pin zones + risc */}
        {zones.map((z) => {
          const pct = Math.round((probs[z.id] || 0) * 100);
          const risk = (probs[z.id] || 0) >= riskThreshold;
          const c = [z.lat, z.lng];
          const d = distOf(z);
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

        {/* Capa deteccions 24h */}
        {showDets && recentDetsResolved.map((d, i) => {
          const col = ptCol[d.patrol_type] || ptCol.unknown;
          const time = d.created_at ? new Date(d.created_at).toLocaleString("ca-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "?";
          return (
            <CircleMarker key={`det-${d.id || i}`} center={[d._lat, d._lng]}
              radius={d._exact ? 6 : 5}
              pathOptions={{ color: col, weight: d._exact ? 2 : 1, fillColor: col, fillOpacity: d._exact ? 0.7 : 0.4 }}>
              <Popup>
                <b>{(d.patrol_type || "?").toUpperCase()}</b> · {d.zone_norm || d.zone || "?"}<br />
                <span style={{ fontSize: 11, opacity: 0.85 }}>{time}{d._exact ? "" : " · zona aprox."}</span>
                {d.raw_message && <><br /><span style={{ fontStyle: "italic", fontSize: 12 }}>"{(d.raw_message || "").substring(0, 80)}"</span></>}
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Marcador de l'usuari */}
        {userPos && (
          <Fragment>
            <Circle center={[userPos.lat, userPos.lng]} radius={userPos.acc || 50}
              pathOptions={{ color: t.accent, weight: 1, fillColor: t.accent, fillOpacity: 0.1 }} />
            <Marker position={[userPos.lat, userPos.lng]} icon={userIcon(t)}>
              <Popup>
                <b>📍 La teva posició</b><br />
                {userPos.lat.toFixed(5)}, {userPos.lng.toFixed(5)}<br />
                <span style={{ fontSize: 11, opacity: 0.85 }}>Precisió ±{Math.round(userPos.acc || 0)}m</span>
                {userPos.acc > 500 && (
                  <><br /><span style={{ fontSize: 11, color: t.warning || "#ffb020", fontWeight: 700 }}>⚠ Precisió baixa — activa el GPS al telèfon</span></>
                )}
              </Popup>
            </Marker>
          </Fragment>
        )}
      </MapContainer>

      {/* Barra d'eines — col·lapsada per defecte (només el botó ≡), s'expandeix al tocar.
          Així el mapa té tota la pantalla per ell i les eines no l'envaeixen. */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 500, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        <button
          className={`pt-mapbtn${showTools ? " active" : ""}`}
          onClick={() => setShowTools((v) => !v)}
          title="Eines del mapa"
          aria-label="Eines del mapa"
          style={{ minWidth: 38, justifyContent: "center" }}
        >
          {showTools ? "✕" : "≡"}
        </button>
        {showTools && (
          <>
            <button className="pt-mapbtn" onClick={locate} disabled={locating} title="Centra el mapa a la teva posició GPS actual">
              {locating ? "⏳ Buscant…" : "📍 Jo"}
            </button>
            <button className={`pt-mapbtn${following ? " active" : ""}`} onClick={toggleFollow}
              title={following ? "Para de seguir-te" : "El mapa et seguirà mentre et mous"}>
              {following ? "● Seguint" : "○ Seguir"}
            </button>
            <button className="pt-mapbtn" onClick={fitAll} title="Enquadra el mapa per veure totes les zones de Lleida">
              ⤢ Tot
            </button>
            <button className={`pt-mapbtn${showDets ? " active" : ""}`} onClick={() => setShowDets((v) => !v)}
              title="Mostra/amaga les deteccions reals de les últimes 24h">
              {showDets ? "● 24h" : "○ 24h"}
            </button>
            <button className="pt-mapbtn" onClick={() => setShowTilePicker((v) => !v)}
              title="Canvia l'estil del mapa (fosc, clar, voyager…)">
              {currentTile.emoji} Estil
            </button>
            {showTilePicker && (
              <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: 6, boxShadow: "0 4px 14px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
                {Object.entries(TILE_SETS).map(([k, ts]) => (
                  <button key={k} onClick={() => { setTile(k); setShowTilePicker(false); }}
                    style={{ background: tileKey === k ? t.accent : "transparent", color: tileKey === k ? t.bg : t.text, border: "none", padding: "6px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", gap: 6, alignItems: "center" }}>
                    <span>{ts.emoji}</span><span>{ts.label}</span>
                  </button>
                ))}
                <button onClick={() => { resetTile(); setShowTilePicker(false); }}
                  style={{ background: "transparent", color: t.textDim, border: `1px dashed ${t.border}`, padding: "5px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginTop: 2 }}>
                  ↻ Auto (segons skin)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Error de localització */}
      {locErr && (
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 500, background: t.danger, color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,.4)", maxWidth: 240 }}>
          ⚠ {locErr}
        </div>
      )}

      {/* Badge precisió */}
      {userPos && !locErr && (
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 500, background: t.surface, border: `1px solid ${userPos.acc > 500 ? (t.warning || "#ffb020") : userPos.acc > 100 ? t.border : (t.success || "#22d97a")}`, color: userPos.acc > 500 ? (t.warning || "#ffb020") : t.textDim, padding: "5px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
          GPS ±{Math.round(userPos.acc)}m{userPos.acc > 500 ? " ⚠" : ""}
        </div>
      )}

      {/* Llegenda — bottom-left, plegable. Inclou explicació dels colors I dels botons. */}
      <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 500, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: showLegend ? "8px 10px" : "6px 10px", fontSize: 11, color: t.textDim, boxShadow: "0 2px 8px rgba(0,0,0,.4)", maxWidth: 220 }}>
        <div onClick={() => setShowLegend((v) => !v)} style={{ cursor: "pointer", fontWeight: 700, color: t.text, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>{showLegend ? "Llegenda" : "ⓘ Llegenda"}</span><span style={{ opacity: 0.6 }}>{showLegend ? "▼" : "▲"}</span>
        </div>
        {showLegend && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Colors al mapa */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: t.danger, display: "inline-block" }} />
              <span>Zona de risc (≥{Math.round(riskThreshold * 100)}%)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: t.accent, display: "inline-block" }} />
              <span>Zona normal</span>
            </div>
            {showDets && (
              <>
                <div style={{ height: 1, background: t.border, margin: "4px 0" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ptCol.mossos, display: "inline-block" }} />
                  <span>Mossos (24h)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ptCol.guardia, display: "inline-block" }} />
                  <span>Guàrdia Civil (24h)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ptCol.local, display: "inline-block" }} />
                  <span>Policia Local (24h)</span>
                </div>
              </>
            )}
            {userPos && (
              <>
                <div style={{ height: 1, background: t.border, margin: "4px 0" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.accent, border: "2px solid #fff", display: "inline-block" }} />
                  <span>La teva posició</span>
                </div>
              </>
            )}

            {/* Què fan els botons (≡ a dalt a la dreta) */}
            <div style={{ height: 1, background: t.border, margin: "4px 0" }} />
            <div style={{ fontWeight: 700, color: t.text, marginBottom: 2 }}>≡ Eines (a dalt a la dreta)</div>
            <div><b style={{ color: t.text }}>📍 Jo</b> — centra al teu GPS</div>
            <div><b style={{ color: t.text }}>○ Seguir</b> — segueix-te mentre et mous</div>
            <div><b style={{ color: t.text }}>⤢ Tot</b> — veure totes les zones</div>
            <div><b style={{ color: t.text }}>● 24h</b> — marca deteccions d'avui</div>
            <div><b style={{ color: t.text }}>{currentTile.emoji} Estil</b> — canvia l'aspecte</div>
          </div>
        )}
      </div>
    </div>
  );
}
