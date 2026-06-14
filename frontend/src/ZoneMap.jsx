import { useEffect, useMemo, useRef, useState } from "react";
import { ptWith } from "./lib/constants";
import { distKm, resolveDetCoords } from "./lib/utils";

// ZoneMap — mapa ESQUEMÀTIC de cercles, sense tiles externs.
// Pensat per a mòbils sense Google Play (Huawei): no depèn d'OpenStreetMap/CARTO,
// es dibuixa amb SVG i sempre carrega. Les zones s'estiren per OMPLIR el marc
// (com el mapa original), amb anells pulsants. La teva posició GPS es projecta a
// la mateixa escala; encara que el fix sigui imprecís, et situa "prop de la zona".
const USER_COLOR = "#00e5ff";

export default function ZoneMap({
  zones = [], probs = {}, selected, onSelect,
  detections = [], theme, radarPos = null, riskThreshold = 0.5,
}) {
  const C = theme;
  const PT = ptWith(C);
  const [userPos, setUserPos] = useState(radarPos);
  const [locErr, setLocErr] = useState(null);
  const [locating, setLocating] = useState(false);
  const [justLocated, setJustLocated] = useState(false);
  const watchRef = useRef(null);

  // Mida real del contenidor → viewBox en píxels (cercles sense distorsió, marc ple)
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 480 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setSize({ w: el.clientWidth || 360, h: el.clientHeight || 480 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (radarPos) setUserPos(radarPos); }, [radarPos]);

  const errMsg = (e) => {
    if (!e) return "Error desconegut";
    if (e.code === 1) return "Permís d'ubicació denegat — actívalo al navegador";
    if (e.code === 2) return "Posició no disponible (GPS apagat?)";
    if (e.code === 3) return "Temps esgotat — torna a provar";
    return e.message || "Error de GPS";
  };

  // Localitza: millor fix en uns segons (l'esquema tolera imprecisió).
  const locate = () => {
    if (!navigator.geolocation) { setLocErr("GPS no disponible al navegador"); return; }
    setLocErr(null); setLocating(true);
    let best = null, done = false, tId = null;
    const finish = () => {
      if (done) return; done = true;
      if (tId) clearTimeout(tId);
      if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
      setLocating(false);
      if (best || userPos) { setJustLocated(true); setTimeout(() => setJustLocated(false), 2000); }
      else setLocErr("No s'ha pogut obtenir la posició — activa el GPS i surt a fora");
    };
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const np = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setUserPos(np);
        if (!best || np.acc < best.acc) best = np;
        if (np.acc <= 150) finish();
      },
      (e) => { if (!best) { setLocErr(errMsg(e)); setLocating(false); done = true; if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; } } },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    tId = setTimeout(finish, 10000);
  };

  useEffect(() => {
    if (!radarPos) locate();
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Projecció: estira la caixa de zones per OMPLIR el marc ────────────────
  const proj = useMemo(() => {
    if (!zones.length) return null;
    const { w, h } = size;
    const lats = zones.map(z => z.lat), lngs = zones.map(z => z.lng);
    const latMin = Math.min(...lats), latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
    const padX = 36, padTop = 46, padBottom = 88; // espai per botó/badge i fitxa
    const innerW = Math.max(10, w - 2 * padX);
    const innerH = Math.max(10, h - padTop - padBottom);
    const project = (lat, lng) => {
      const nx = (lng - lngMin) / ((lngMax - lngMin) || 1);
      const ny = (latMax - lat) / ((latMax - latMin) || 1);
      return [padX + nx * innerW, padTop + ny * innerH];
    };
    return { project, w, h, latMin, latMax, lngMin, lngMax };
  }, [zones, size]);

  // Deteccions de les últimes 24h amb coordenades resoltes
  const recentDets = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const out = [];
    for (const d of detections) {
      const ts = d.created_at ? new Date(d.created_at).getTime() : 0;
      if (ts < cutoff) continue;
      const c = resolveDetCoords(d);
      if (!c) continue;
      out.push({ ...d, _lat: c.lat, _lng: c.lng, _exact: c.exact });
      if (out.length >= 60) break;
    }
    return out;
  }, [detections]);

  if (!proj) return null;
  const { project, w, h } = proj;

  // Posició d'usuari projectada (clamped si cau fora del marc)
  let userXY = null, userOff = false;
  if (userPos) {
    const [ux, uy] = project(userPos.lat, userPos.lng);
    const pad = 8;
    const cx = Math.max(pad, Math.min(w - pad, ux));
    const cy = Math.max(pad, Math.min(h - pad, uy));
    userOff = (Math.abs(cx - ux) > 0.5 || Math.abs(cy - uy) > 0.5);
    userXY = [cx, cy];
  }

  const distOf = (z) => userPos ? Math.round(distKm(userPos.lat, userPos.lng, z.lat, z.lng) * 10) / 10 : null;
  const nearest = userPos
    ? zones.map(z => ({ z, d: distKm(userPos.lat, userPos.lng, z.lat, z.lng) })).sort((a, b) => a.d - b.d)[0]
    : null;

  // Color CONTINU segons la probabilitat: verd (0%) → groc → taronja → vermell
  // (100%). Com més % de control, més càlid i vermell.
  const colorFor = (p) => {
    const q = Math.min(1, Math.max(0, p));
    const hue = 140 - 140 * q;          // 140=verd → 0=vermell (passa per groc/taronja)
    const sat = 85 + q * 10;            // més saturat com més risc
    const light = 58 - q * 8;           // una mica més fosc/intens a dalt
    return `hsl(${Math.round(hue)},${Math.round(sat)}%,${Math.round(light)}%)`;
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", height: "100%", width: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg }}>
      <style>{`@keyframes zmUser{0%,100%{opacity:1}50%{opacity:.5}}@keyframes zmRipple{0%{r:8px;opacity:.7}100%{r:46px;opacity:0}}`}</style>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
        <defs>
          <pattern id="zmGrid" width="46" height="46" patternUnits="userSpaceOnUse">
            <path d="M46 0H0V46" fill="none" stroke={C.border} strokeWidth="1" opacity="0.3" />
          </pattern>
          {/* glow suau per al nucli de cada zona */}
          <filter id="zmGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* degradat radial per zona (color segons % de control) */}
          {zones.map((z, zi) => {
            const col = colorFor(probs[z.id] || 0);
            return (
              <radialGradient key={zi} id={`zgrad-${zi}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={col} stopOpacity={0.5 + (probs[z.id] || 0) * 0.35} />
                <stop offset="70%" stopColor={col} stopOpacity={0.18} />
                <stop offset="100%" stopColor={col} stopOpacity="0.02" />
              </radialGradient>
            );
          })}
        </defs>
        <rect x="0" y="0" width={w} height={h} fill="url(#zmGrid)" />

        {/* línia usuari → zona més propera */}
        {userXY && nearest && (() => {
          const [zx, zy] = project(nearest.z.lat, nearest.z.lng);
          return <line x1={userXY[0]} y1={userXY[1]} x2={zx} y2={zy} stroke={USER_COLOR} strokeWidth="2" strokeDasharray="5 6" opacity="0.55" />;
        })()}

        {/* zones — estil radar futurista: nucli amb glow + ones expansives */}
        {zones.map((z, zi) => {
          const [x, y] = project(z.lat, z.lng);
          const p = probs[z.id] || 0;
          const col = colorFor(p);
          const r = (11 + (Math.min(z.rKm || 5, 20) / 20) * 12) * (1 + p * 0.18);
          const isSel = z.id === selected;
          const d = distOf(z);
          // Ones: més % → més ràpides, més grans i més intenses
          const dur = 3.4 - p * 1.6;                 // 3.4s (calm) → 1.8s (risc)
          const reach = r + 16 + p * 30;             // fins on arriba l'ona
          const waveOp = 0.45 + p * 0.4;             // opacitat inicial de l'ona
          const NW = 3;                              // 3 ones esglaonades
          return (
            <g key={z.id} onClick={() => onSelect && onSelect(z.id)} style={{ cursor: "pointer" }}>
              {/* ones expansives contínues */}
              {Array.from({ length: NW }).map((_, i) => (
                <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth={1.6} opacity="0">
                  <animate attributeName="r" values={`${r};${reach}`} dur={`${dur}s`} begin={`${(i * dur) / NW}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values={`${waveOp};0`} dur={`${dur}s`} begin={`${(i * dur) / NW}s`} repeatCount="indefinite" />
                  <animate attributeName="stroke-width" values="2.2;0.4" dur={`${dur}s`} begin={`${(i * dur) / NW}s`} repeatCount="indefinite" />
                </circle>
              ))}
              {/* halo + nucli amb degradat i glow */}
              <circle cx={x} cy={y} r={r} fill={`url(#zgrad-${zi})`} stroke={col}
                strokeWidth={isSel ? 3 : 1.6} strokeOpacity={isSel ? 1 : 0.85} />
              <circle cx={x} cy={y} r={4.5} fill={col} filter="url(#zmGlow)" />
              <text x={x} y={y - r - 8} textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text} style={{ pointerEvents: "none" }}>
                {z.label || z.id}
              </text>
              <text x={x} y={y - r - 8 + 15} textAnchor="middle" fontSize="13" fontWeight="800" fill={col} style={{ pointerEvents: "none" }}>
                {Math.round(p * 100)}%{d != null ? ` · ${d}km` : ""}
              </text>
            </g>
          );
        })}

        {/* deteccions 24h */}
        {recentDets.map((d, i) => {
          const [x, y] = project(d._lat, d._lng);
          const col = PT[d.patrol_type]?.color || C.textDim;
          return <circle key={`d-${d.id || i}`} cx={x} cy={y} r={d._exact ? 5 : 3.5} fill={col} fillOpacity={d._exact ? 0.9 : 0.5} stroke={C.bg} strokeWidth="1.5" />;
        })}

        {/* usuari */}
        {userXY && (
          <g>
            {justLocated && <circle cx={userXY[0]} cy={userXY[1]} r="8" fill="none" stroke={USER_COLOR} strokeWidth="2" style={{ animation: "zmRipple 1.2s ease-out 2" }} />}
            <circle cx={userXY[0]} cy={userXY[1]} r="13" fill={USER_COLOR} fillOpacity="0.22" />
            <circle cx={userXY[0]} cy={userXY[1]} r="7" fill={USER_COLOR} stroke="#fff" strokeWidth="2.5" style={{ animation: "zmUser 1.8s infinite" }} />
            <text x={userXY[0]} y={userXY[1] - 16} textAnchor="middle" fontSize="12" fontWeight="800" fill={USER_COLOR}>Tu{userOff ? " ↗" : ""}</text>
          </g>
        )}
      </svg>

      {/* Botó localitza */}
      <button onClick={locate} disabled={locating} style={{
        position: "absolute", top: 10, right: 10, zIndex: 10,
        background: locating ? C.border : C.accent, color: locating ? C.textDim : C.bg,
        border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 800,
        cursor: locating ? "wait" : "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,.4)",
      }}>
        {locating ? "⏳ Buscant…" : "📍 Jo"}
      </button>

      {/* Estat GPS / error */}
      {locErr ? (
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 10, background: C.danger, color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, maxWidth: 230, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
          ⚠ {locErr}
        </div>
      ) : userPos ? (
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 10, background: C.surface, border: `1px solid ${userPos.acc > 1000 ? C.warning : C.border}`, color: userPos.acc > 1000 ? C.warning : C.textDim, padding: "5px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
          GPS ±{Math.round(userPos.acc || 0)}m{userPos.acc > 1000 ? " ⚠" : ""}{userOff ? " · fora del mapa" : ""}
        </div>
      ) : null}

      {/* Fitxa zona més propera */}
      {nearest && (
        <div onClick={() => onSelect && onSelect(nearest.z.id)} style={{
          position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 10,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "10px 12px", boxShadow: "0 2px 10px rgba(0,0,0,.45)", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Zona més propera</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nearest.z.label || nearest.z.id}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: colorFor(probs[nearest.z.id] || 0) }}>{Math.round((probs[nearest.z.id] || 0) * 100)}%</div>
            <div style={{ fontSize: 12, color: C.textDim }}>a {Math.round(nearest.d * 10) / 10} km</div>
          </div>
        </div>
      )}
    </div>
  );
}
