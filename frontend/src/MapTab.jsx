import { Fragment, useEffect, useRef, useState, useMemo } from "react"; // eslint-disable-line no-unused-vars
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMap, useMapEvents } from "react-leaflet";
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

// Color fix per al marcador d'usuari — INDEPENDENT del tema perquè mai es confongui
// amb els pins de zona (que usen t.accent) ni amb els pins de tipus de patrulla
// (mossos blau, guardia verd, local lila). Cyan brillant + anell blanc.
const USER_COLOR = "#00e5ff";
const USER_COLOR_GLOW = "#00e5ff";

function userIcon() {
  return L.divIcon({
    className: "", iconSize: [28, 28], iconAnchor: [14, 14],
    html: `
      <div style="position:relative;width:28px;height:28px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:${USER_COLOR};
          border:3px solid #fff;box-shadow:0 0 0 3px ${USER_COLOR}66, 0 0 18px ${USER_COLOR_GLOW};
          animation:ptUserPulse 1.8s infinite ease-in-out;"></div>
        <div style="position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;
          background:#fff;border-radius:50%;"></div>
      </div>`,
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

// Mode "marcar manualment": quan està actiu, el següent toc al mapa fixa la teva
// posició. Imprescindible al Huawei sense Google Play, on el GPS per xarxa cau a
// Lleida i no et situa a Sort.
function ClickToPlace({ active, onPlace }) {
  useMapEvents({ click(e) { if (active) onPlace(e.latlng); } });
  return null;
}

// Distància en km (haversine) — local perquè el component no depengui d'App.jsx
function distKm(a1, o1, a2, o2) {
  const R = 6371, d1 = (a2 - a1) * Math.PI / 180, d2 = (o2 - o1) * Math.PI / 180;
  const a = Math.sin(d1 / 2) ** 2 + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(d2 / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Tile providers — tots gratuïts, sense API key.
// (CARTO ara demana API key i mostrava "API KEY REQUIRED": substituït per Esri Canvas.)
// Sense `{r}` per evitar URLs malformades en navegadors que no actualitzen Leaflet:
// el placeholder {r} només es substitueix si `detectRetina` està activat al TileLayer.
const TILE_SETS = {
  dark:     { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", attr: "© Esri, HERE, Garmin, © OpenStreetMap", label: "Fosc", emoji: "🌑", noSub: true, maxNative: 16 },
  darkmin:  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", attr: "© Esri, HERE, Garmin, © OpenStreetMap", label: "Fosc mínim", emoji: "⚫", noSub: true, maxNative: 16 },
  voyager:  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attr: "© Esri", label: "Voyager", emoji: "🗺", noSub: true },
  positron: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", attr: "© Esri, HERE, Garmin, © OpenStreetMap", label: "Clar", emoji: "☀", noSub: true, maxNative: 16 },
  osm:      { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",                attr: "© OpenStreetMap",            label: "OSM clàssic", emoji: "🌍" },
  // Esri — proveïdor DIFERENT (no OSM), CDN pròpia. Útil si CARTO/OSM no carrega.
  // Sense subdomini {s}: Esri serveix des d'un únic host.
  esriSat:  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "© Esri, Maxar, Earthstar Geographics", label: "Satèl·lit", emoji: "🛰", noSub: true },
  esriTopo: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attr: "© Esri", label: "Topogràfic", emoji: "⛰", noSub: true },
  esriStreet:{ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attr: "© Esri", label: "Carrers (Esri)", emoji: "🛣", noSub: true },
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
  // Darrera posició GPS bona (d'una sessió anterior): el mapa s'obre directament allà
  const [lastPos] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem("pt_last_pos") || "null"); return p && typeof p.lat === "number" ? p : null; } catch { return null; }
  });

  const [showDets, setShowDets] = useState(true);     // capa deteccions 24h
  const [showLegend, setShowLegend] = useState(false);    // per defecte plegada, ocupa menys
  const [showTools, setShowTools] = useState(false);      // barra d'eines plegada per defecte
  const [userPos, setUserPos] = useState(null);       // {lat,lng,acc,manual?}
  const [locErr, setLocErr] = useState(null);
  const [placing, setPlacing] = useState(false);      // mode "tocar per marcar la meva posició"
  const manualRef = useRef(false);                    // posició fixada manualment → ignora GPS boirós
  // Per sobre d'aquesta precisió (m) NO et centrem: un fix tan boirós sol ser la
  // ubicació per xarxa/IP (cau a Lleida), no on ets de veritat (p. ex. Sort).
  const COARSE_M = 2500;
  const [following, setFollowing] = useState(false);  // seguiment continu
  const [mapInstance, setMapInstance] = useState(null);
  const watchRef = useRef(null);
  const followWatchRef = useRef(null);                // watch propi del botó "Seguir"
  const followingRef = useRef(false);                 // mirall de `following` per al watch
  const centeredRef = useRef(false);                  // ja hem centrat en un fix prou bo?
  const bestPosRef = useRef(null);                    // millor fix rebut (menys ±m)
  const autoTimerRef = useRef(null);                  // timeout per centrar si el GPS triga

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
    if (radarPos) {
      if (manualRef.current && radarPos.acc > 300) return; // no trepitgis una posició marcada a mà amb un fix boirós
      setUserPos({ lat: radarPos.lat, lng: radarPos.lng, acc: radarPos.acc });
      if (radarPos.acc <= 300) {
        try { localStorage.setItem("pt_last_pos", JSON.stringify({ lat: radarPos.lat, lng: radarPos.lng, acc: radarPos.acc })); } catch {}
        // Amb el radar actiu el watch base no corre: centra aquí la primera vegada.
        if (mapInstance && !centeredRef.current && !manualRef.current) {
          centeredRef.current = true;
          const far = !lastPos || distKm(lastPos.lat, lastPos.lng, radarPos.lat, radarPos.lng) >= 0.5;
          if (far) mapInstance.flyTo([radarPos.lat, radarPos.lng], radarPos.acc < 80 ? 16 : 14, { duration: 0.9 });
        }
      }
      if (followingRef.current && mapInstance) mapInstance.panTo([radarPos.lat, radarPos.lng], { animate: true, duration: 0.6 });
    }
  }, [radarPos, mapInstance, lastPos]);

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

  const errMsg = (e) => {
    if (!e) return "Error desconegut";
    if (e.code === 1) return "Permís d'ubicació denegat";
    if (e.code === 2) return "Posició no disponible (GPS apagat?)";
    if (e.code === 3) return "Temps esgotat — torna a provar";
    return e.message || "Error de GPS";
  };

  const zoomForAcc = (acc) => acc < 80 ? 16 : acc < 300 ? 14 : acc < 1500 ? 12 : 10;

  // "Seguir" — watch propi que mou el mapa amb tu. En activar-lo recentra de
  // seguida; en desactivar-lo, tanca el watch.
  const toggleFollow = () => {
    if (following) {
      setFollowing(false); followingRef.current = false;
      if (followWatchRef.current != null) { navigator.geolocation.clearWatch(followWatchRef.current); followWatchRef.current = null; }
      return;
    }
    if (!navigator.geolocation) { setLocErr("GPS no disponible al navegador"); return; }
    setLocErr(null);
    setFollowing(true); followingRef.current = true;
    if (userPos && mapInstance) mapInstance.panTo([userPos.lat, userPos.lng], { animate: true, duration: 0.6 });
    followWatchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const np = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setUserPos(np);
        if (mapInstance) mapInstance.panTo([np.lat, np.lng], { animate: true, duration: 0.5 });
      },
      (e) => { setLocErr(errMsg(e)); setFollowing(false); followingRef.current = false; },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  };

  // Watch de base — manté el punt blau SEMPRE marcat sense que l'usuari hagi de
  // tocar res, i centra el mapa a la teva ubicació en obrir-lo. Si el radar ja
  // ens alimenta la posició (radarPos), no n'obrim un de propi (estalvi bateria).
  // No centra en un fix coarse (xarxa/ISP → Lleida): espera un fix decent (≤300m)
  // o, si el GPS triga, centra al millor fix obtingut als 9s.
  useEffect(() => {
    if (radarPos) return;                 // el radar ja ens dóna la posició
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const np = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        // Si l'usuari ha fixat la posició manualment, no la sobreescriguis amb un
        // fix boirós; només un GPS bo (≤300m) recupera el control automàtic.
        if (manualRef.current && np.acc > 300) return;
        if (np.acc <= 300) manualRef.current = false;
        setUserPos(np);
        if (!bestPosRef.current || np.acc < bestPosRef.current.acc) bestPosRef.current = np;
        if (np.acc <= 300) { try { localStorage.setItem("pt_last_pos", JSON.stringify({ lat: np.lat, lng: np.lng, acc: np.acc })); } catch {} }
        if (mapInstance && !centeredRef.current && np.acc <= 300) {
          centeredRef.current = true;
          // Si ja hem obert el mapa a la darrera posició i és a prop, no tornem a volar
          if (lastPos && distKm(lastPos.lat, lastPos.lng, np.lat, np.lng) < 0.5) return;
          mapInstance.flyTo([np.lat, np.lng], zoomForAcc(np.acc), { duration: 0.9 });
        }
        // El seguiment continu el gestiona el watch propi de toggleFollow.
      },
      (e) => { setLocErr(errMsg(e)); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    watchRef.current = id;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      // Fallback: centra al millor fix NOMÉS si és prou bo. Si l'únic que tenim és
      // boirós (xarxa → Lleida), no et movem allà; avisem perquè marquis manualment.
      if (centeredRef.current || manualRef.current) return;
      const bp = bestPosRef.current;
      if (mapInstance && bp && bp.acc <= COARSE_M) {
        centeredRef.current = true;
        mapInstance.flyTo([bp.lat, bp.lng], zoomForAcc(bp.acc), { duration: 0.9 });
      } else if (bp) {
        setLocErr("GPS imprecís (xarxa) — toca «📌 Marcar» i indica on ets al mapa");
      }
    }, 9000);
    return () => {
      navigator.geolocation.clearWatch(id);
      if (watchRef.current === id) watchRef.current = null;
      if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, [radarPos, mapInstance]);

  // Cleanup watches al desmuntar
  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    if (followWatchRef.current != null) navigator.geolocation.clearWatch(followWatchRef.current);
  }, []);

  // Arregla el "no es pot moure": quan el mapa es munta dins la pestanya, Leaflet
  // pot mesurar malament el contenidor i l'àrea arrossegable queda desplaçada o
  // bloquejada. invalidateSize() força el recàlcul. Ho fem en muntar i en redimensionar.
  useEffect(() => {
    if (!mapInstance) return;
    const fix = () => mapInstance.invalidateSize();
    const t0 = setTimeout(fix, 0);
    const t1 = setTimeout(fix, 300);
    window.addEventListener("resize", fix);
    window.addEventListener("orientationchange", fix);
    return () => {
      clearTimeout(t0); clearTimeout(t1);
      window.removeEventListener("resize", fix);
      window.removeEventListener("orientationchange", fix);
    };
  }, [mapInstance]);

  // Restaura una posició marcada manualment en sessions anteriors
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pt_manual_pos");
      if (saved) {
        const p = JSON.parse(saved);
        if (p && typeof p.lat === "number" && typeof p.lng === "number") {
          manualRef.current = true;
          centeredRef.current = true;
          setUserPos({ lat: p.lat, lng: p.lng, acc: 0, manual: true });
        }
      }
    } catch {}
  }, []);

  // Toc al mapa en mode "Marcar" → fixa la teva posició aquí
  const placePos = (latlng) => {
    const np = { lat: latlng.lat, lng: latlng.lng, acc: 0, manual: true };
    manualRef.current = true;
    centeredRef.current = true;
    setUserPos(np);
    setPlacing(false);
    setLocErr(null);
    try { localStorage.setItem("pt_manual_pos", JSON.stringify({ lat: np.lat, lng: np.lng })); } catch {}
    if (mapInstance) mapInstance.flyTo([np.lat, np.lng], 13, { duration: 0.6 });
  };

  // Esborra la posició manual i torna a confiar en el GPS
  const clearManual = () => {
    manualRef.current = false;
    centeredRef.current = false;
    try { localStorage.removeItem("pt_manual_pos"); } catch {}
    setUserPos(null);
    setLocErr(null);
  };

  const fitAll = () => {
    if (mapInstance && points.length) mapInstance.fitBounds(points, { padding: [30, 30] });
  };

  const ptCol = PT_COLOR(t);

  return (
    <div className={placing ? "pt-placing" : ""} style={{ position: "relative", height: "100%", width: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}` }}>
      <style>{`
        .pt-placing .leaflet-container{cursor:crosshair}
        @keyframes ptPulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes ptUserPulse{0%,100%{box-shadow:0 0 0 3px ${USER_COLOR}66, 0 0 14px ${USER_COLOR}}50%{box-shadow:0 0 0 10px ${USER_COLOR}22, 0 0 22px ${USER_COLOR}}}
        .leaflet-container{background:${t.bg};font-family:inherit}
        .leaflet-popup-content-wrapper,.leaflet-popup-tip{background:${t.surface};color:${t.text};border:1px solid ${t.border}}
        .leaflet-popup-content{margin:10px 12px;font-size:13px}
        .pt-mapbtn{background:${t.surface};color:${t.text};border:1px solid ${t.border};border-radius:8px;padding:8px 10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,.4);transition:all .15s}
        .pt-mapbtn:hover{background:${t.bg};border-color:${t.accent}66}
        .pt-mapbtn.active{background:${t.accent};color:${t.bg};border-color:${t.accent}}
      `}</style>

      <MapContainer center={lastPos ? [lastPos.lat, lastPos.lng] : [41.95, 0.95]} zoom={lastPos ? (lastPos.acc < 80 ? 16 : 14) : 8} zoomControl={false} style={{ height: "100%", width: "100%", background: t.bg }}>
        <TileLayer key={tileKey} url={currentTile.url} attribution={currentTile.attr} detectRetina={true} maxZoom={19} maxNativeZoom={currentTile.maxNative || 19} />
        {currentTile.labels && <TileLayer key={tileKey + "-labels"} url={currentTile.labels} detectRetina={true} maxZoom={19} maxNativeZoom={currentTile.maxNative || 19} />}
        <MapHandle onReady={setMapInstance} />
        <ClickToPlace active={placing} onPlace={placePos} />
        {!lastPos && <FitAll points={points} />}
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
              pathOptions={{ color: USER_COLOR, weight: 1.5, fillColor: USER_COLOR, fillOpacity: 0.1 }} />
            <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()}>
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
          maxHeight + overflowY garanteixen que tots els botons són accessibles fins i tot
          en pantalles curtes (Huawei P40 Lite, navegador amb URL bar visible). */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 500, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", maxHeight: "calc(100% - 20px)", overflowY: "auto", overflowX: "hidden" }}>
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
            <button className={`pt-mapbtn${following ? " active" : ""}`} onClick={toggleFollow}
              title={following ? "Para de seguir-te" : "El mapa et seguirà mentre et mous"}>
              {following ? "● Seguint" : "○ Seguir"}
            </button>
            <button className={`pt-mapbtn${placing ? " active" : ""}`} onClick={() => setPlacing((v) => !v)}
              title="Toca el mapa per fixar manualment on ets (útil si el GPS falla)">
              {placing ? "✓ Toca el mapa…" : "📌 Marcar"}
            </button>
            {userPos?.manual && (
              <button className="pt-mapbtn" onClick={clearManual}
                title="Esborra la posició manual i torna a usar el GPS">
                ↻ GPS
              </button>
            )}
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

      {/* Avís mode marcar */}
      {placing && (
        <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 600, background: t.accent, color: t.bg, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, boxShadow: "0 2px 10px rgba(0,0,0,.5)", whiteSpace: "nowrap" }}>
          📌 Toca el mapa on ets (p. ex. Sort)
        </div>
      )}

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
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: USER_COLOR, border: "2px solid #fff", boxShadow: `0 0 6px ${USER_COLOR}88`, display: "inline-block" }} />
                  <span>La teva posició</span>
                </div>
              </>
            )}

            {/* Què fan els botons (≡ a dalt a la dreta) */}
            <div style={{ height: 1, background: t.border, margin: "4px 0" }} />
            <div style={{ fontWeight: 700, color: t.text, marginBottom: 2 }}>≡ Eines (a dalt a la dreta)</div>
            <div><b style={{ color: t.text }}>○ Seguir</b> — centra't i segueix-te mentre et mous</div>
            <div><b style={{ color: t.text }}>📌 Marcar</b> — toca el mapa i fixa on ets (si el GPS falla)</div>
            <div><b style={{ color: t.text }}>⤢ Tot</b> — veure totes les zones</div>
            <div><b style={{ color: t.text }}>● 24h</b> — marca deteccions d'avui</div>
            <div><b style={{ color: t.text }}>{currentTile.emoji} Estil</b> — canvia l'aspecte</div>
          </div>
        )}
      </div>
    </div>
  );
}
