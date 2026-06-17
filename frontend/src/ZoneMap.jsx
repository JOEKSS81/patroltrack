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
  // `zoomToMe` (botó Jo) centra i fa zoom al punt de l'usuari en acabar.
  const locate = (zoomToMe = false) => {
    if (!navigator.geolocation) { setLocErr("GPS no disponible al navegador"); return; }
    setLocErr(null); setLocating(true);
    let best = null, done = false, tId = null;
    const finish = () => {
      if (done) return; done = true;
      if (tId) clearTimeout(tId);
      if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
      setLocating(false);
      if (best || userPos) { setJustLocated(true); setTimeout(() => setJustLocated(false), 2000); if (zoomToMe) zoomToUserRef.current = true; }
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

  // Quan el botó Jo aconsegueix posició, centra i fa zoom al punt de l'usuari.
  useEffect(() => {
    if (!zoomToUserRef.current || !userPos || !projRef.current) return;
    zoomToUserRef.current = false;
    const { project, w, h } = projRef.current;
    const [ux, uy] = project(userPos.lat, userPos.lng);
    const s = 2.6;
    setView({ s, tx: w / 2 - s * ux, ty: h / 2 - s * uy });
  }, [userPos]);

  // ── Pan & zoom (ratolí, roda i tàctil amb pinça) ──────────────────────────
  const svgRef = useRef(null);
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const pointersRef = useRef(new Map());
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const movedRef = useRef(false);
  const projRef = useRef(null);        // {project,w,h} per centrar des de fora del render
  const zoomToUserRef = useRef(false); // el botó Jo demana centrar a l'usuari
  const clampS = (s) => Math.min(5, Math.max(0.6, s));
  const localXY = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const zoomAt = (factor, cx, cy) => setView(v => {
    const s2 = clampS(v.s * factor), k = s2 / v.s;
    return { s: s2, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
  });
  const onWheel = (e) => { e.preventDefault(); const [cx, cy] = localXY(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, cx, cy); };
  const onPointerDown = (e) => {
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const [x, y] = localXY(e);
    pointersRef.current.set(e.pointerId, { x, y });
    movedRef.current = false;
    if (pointersRef.current.size === 1) {
      dragRef.current = { sx: x, sy: y, tx: viewRef.current.tx, ty: viewRef.current.ty };
    } else if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        midx: (pts[0].x + pts[1].x) / 2, midy: (pts[0].y + pts[1].y) / 2,
        s: viewRef.current.s, tx: viewRef.current.tx, ty: viewRef.current.ty,
      };
      dragRef.current = null;
    }
  };
  const onPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const [x, y] = localXY(e);
    pointersRef.current.set(e.pointerId, { x, y });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const p = pinchRef.current, s2 = clampS(p.s * (dist / (p.dist || 1))), k = s2 / p.s;
      setView({ s: s2, tx: p.midx - (p.midx - p.tx) * k, ty: p.midy - (p.midy - p.ty) * k });
      movedRef.current = true;
    } else if (dragRef.current) {
      const d = dragRef.current, dx = x - d.sx, dy = y - d.sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
      setView(v => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
    }
  };
  const onPointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
    else {
      const pt = [...pointersRef.current.values()][0];
      dragRef.current = { sx: pt.x, sy: pt.y, tx: viewRef.current.tx, ty: viewRef.current.ty };
    }
  };
  // Si s'ha arrossegat, evita que el "click" seleccioni una zona sense voler.
  const onClickCapture = (e) => { if (movedRef.current) { e.stopPropagation(); movedRef.current = false; } };
  const resetView = () => setView({ s: 1, tx: 0, ty: 0 });

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
  projRef.current = { project, w, h };

  // Posició d'usuari projectada (posició real; amb pan/zoom es pot explorar).
  // userOff = cau fora del marc per defecte (pista per reenquadrar).
  let userXY = null, userOff = false;
  if (userPos) {
    const [ux, uy] = project(userPos.lat, userPos.lng);
    userOff = (ux < 0 || ux > w || uy < 0 || uy > h);
    userXY = [ux, uy];
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
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: dragRef.current ? "grabbing" : "grab" }}>
        <defs>
          <pattern id="zmGrid" width="46" height="46" patternUnits="userSpaceOnUse">
            <path d="M46 0H0V46" fill="none" stroke={C.border} strokeWidth="1" opacity="0.3" />
          </pattern>
          {/* glow neó per a anells i nuclis */}
          <filter id="zmGlow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
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
        {/* grup amb pan & zoom; la graella s'estén molt més enllà del marc */}
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
        <rect x={-w * 2} y={-h * 2} width={w * 5} height={h * 5} fill="url(#zmGrid)" />

        {/* línia usuari → zona més propera */}
        {userXY && nearest && (() => {
          const [zx, zy] = project(nearest.z.lat, nearest.z.lng);
          return <line x1={userXY[0]} y1={userXY[1]} x2={zx} y2={zy} stroke={USER_COLOR} strokeWidth="2" strokeDasharray="5 6" opacity="0.55" />;
        })()}

        {/* zones — anells neó esvelts + ones expansives */}
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
          const waveOp = 0.4 + p * 0.4;              // opacitat inicial de l'ona
          const NW = 3;                              // 3 ones esglaonades
          return (
            <g key={z.id} onClick={() => onSelect && onSelect(z.id)} style={{ cursor: "pointer" }}>
              {/* ones expansives contínues (fines, neó) */}
              {Array.from({ length: NW }).map((_, i) => (
                <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={col} strokeWidth={1.2} opacity="0">
                  <animate attributeName="r" values={`${r};${reach}`} dur={`${dur}s`} begin={`${(i * dur) / NW}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values={`${waveOp};0`} dur={`${dur}s`} begin={`${(i * dur) / NW}s`} repeatCount="indefinite" />
                  <animate attributeName="stroke-width" values="1.6;0.2" dur={`${dur}s`} begin={`${(i * dur) / NW}s`} repeatCount="indefinite" />
                </circle>
              ))}
              {/* zona de selecció (tap-target invisible, més gran) */}
              <circle cx={x} cy={y} r={r + 10} fill="transparent" />
              {/* anell neó esvelt — buit, amb glow */}
              <circle cx={x} cy={y} r={r} fill={`url(#zgrad-${zi})`} fillOpacity={0.6} stroke={col}
                strokeWidth={isSel ? 2.6 : 1.6} strokeOpacity={isSel ? 1 : 0.9} filter="url(#zmGlow)" />
              {isSel && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={col} strokeWidth="1" strokeDasharray="3 4" opacity="0.8" />}
              {/* nucli petit i brillant */}
              <circle cx={x} cy={y} r={3} fill="#fff" />
              <circle cx={x} cy={y} r={5.5} fill="none" stroke={col} strokeWidth="1.4" filter="url(#zmGlow)" />
              <text x={x} y={y - r - 9} textAnchor="middle" fontSize="13" fontWeight="700" fill={C.text} style={{ pointerEvents: "none" }}>
                {z.label || z.id}
              </text>
              <text x={x} y={y - r - 9 + 15} textAnchor="middle" fontSize="13" fontWeight="800" fill={col} style={{ pointerEvents: "none" }}>
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
        </g>
      </svg>

      {/* Botó localitza */}
      <button onClick={() => locate(true)} disabled={locating} style={{
        position: "absolute", top: 10, right: 10, zIndex: 10,
        background: locating ? C.border : C.accent, color: locating ? C.textDim : C.bg,
        border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 800,
        cursor: locating ? "wait" : "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,.4)",
      }}>
        {locating ? "⏳ Buscant…" : "📍 Jo"}
      </button>

      {/* Controls de zoom */}
      <div style={{ position: "absolute", top: 56, right: 10, zIndex: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {[["＋", () => zoomAt(1.3, w / 2, h / 2), "Apropar"],
          ["－", () => zoomAt(1 / 1.3, w / 2, h / 2), "Allunyar"],
          ["⤢", resetView, "Reenquadrar"]].map(([lbl, fn, title]) => (
          <button key={title} onClick={fn} title={title} style={{
            width: 40, height: 40, background: C.surface, color: C.text, border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>{lbl}</button>
        ))}
      </div>

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
