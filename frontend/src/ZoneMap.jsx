import { useEffect, useMemo, useRef, useState } from "react";
import { ptWith } from "./lib/constants";
import { distKm, resolveDetCoords } from "./lib/utils";

// ZoneMap — mapa ESQUEMÀTIC de cercles, sense tiles externs.
// Pensat per a mòbils sense Google Play (Huawei): no depèn d'OpenStreetMap/CARTO,
// es dibuixa amb SVG i sempre carrega. Cada zona és un cercle proporcional al seu
// radi real (rKm) i acolorit per l'activitat. La teva posició GPS es projecta a
// l'escala de les zones; encara que el fix sigui imprecís, et situa correctament.
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
  const watchRef = useRef(null);

  // Sincronitza amb el radar si està actiu
  useEffect(() => { if (radarPos) setUserPos(radarPos); }, [radarPos]);

  const errMsg = (e) => {
    if (!e) return "Error desconegut";
    if (e.code === 1) return "Permís d'ubicació denegat";
    if (e.code === 2) return "Posició no disponible (GPS apagat?)";
    if (e.code === 3) return "Temps esgotat — torna a provar";
    return e.message || "Error de GPS";
  };

  // Localitza: agafa el millor fix en uns segons (no cal ser ultraprecís aquí,
  // l'esquema tolera imprecisió). S'autocrida en muntar.
  const locate = () => {
    if (!navigator.geolocation) { setLocErr("GPS no disponible al navegador"); return; }
    setLocErr(null); setLocating(true);
    let best = null, done = false, wId = null, tId = null;
    const finish = () => {
      if (done) return; done = true;
      if (tId) clearTimeout(tId);
      if (wId != null) navigator.geolocation.clearWatch(wId);
      setLocating(false);
      if (!best && !userPos) setLocErr("No s'ha pogut obtenir la posició — activa el GPS");
    };
    wId = navigator.geolocation.watchPosition(
      (p) => {
        const np = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setUserPos(np);
        if (!best || np.acc < best.acc) best = np;
        if (np.acc <= 150) finish();
      },
      (e) => { if (!best) { setLocErr(errMsg(e)); setLocating(false); done = true; if (wId != null) navigator.geolocation.clearWatch(wId); } },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    tId = setTimeout(finish, 10000);
  };

  useEffect(() => {
    if (!radarPos) locate();
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Projecció lat/lng → coordenades del viewBox ──────────────────────────
  const proj = useMemo(() => {
    if (!zones.length) return null;
    const lats = zones.map(z => z.lat), lngs = zones.map(z => z.lng);
    const latMin = Math.min(...lats), latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
    const latMid = (latMin + latMax) / 2;
    const kx = Math.cos(latMid * Math.PI / 180);       // compressió longitud
    const worldW = Math.max(1e-6, (lngMax - lngMin) * kx);
    const worldH = Math.max(1e-6, (latMax - latMin));
    const M = 0.14;                                      // marge fraccional
    const VBW = 1000;
    const VBH = Math.round(VBW * (worldH / worldW));
    const innerW = (1 - 2 * M) * VBW, innerH = (1 - 2 * M) * VBH;
    const project = (lat, lng) => {
      const nx = ((lng - lngMin) * kx) / worldW;
      const ny = (latMax - lat) / worldH;
      return [M * VBW + nx * innerW, M * VBH + ny * innerH];
    };
    // km → unitats del viewBox (per dibuixar radis i precisió a escala real)
    const kmToVB = innerW / (worldW * 111);
    return { project, VBW, VBH, kmToVB, latMin, latMax, lngMin, lngMax };
  }, [zones]);

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
  const { project, VBW, VBH, kmToVB } = proj;

  // Posició d'usuari projectada (clamped si cau fora del marc)
  let userXY = null, userOff = false, userAccR = 0;
  if (userPos) {
    let [ux, uy] = project(userPos.lat, userPos.lng);
    const pad = 6;
    const cx = Math.max(pad, Math.min(VBW - pad, ux));
    const cy = Math.max(pad, Math.min(VBH - pad, uy));
    userOff = (cx !== ux || cy !== uy);
    userXY = [cx, cy];
    userAccR = Math.min(VBW * 0.25, Math.max(6, (userPos.acc / 1000) * kmToVB));
  }

  // Distància de l'usuari a una zona
  const distOf = (z) => userPos ? Math.round(distKm(userPos.lat, userPos.lng, z.lat, z.lng) * 10) / 10 : null;

  // Zona més propera (per a la fitxa de baix)
  const nearest = userPos
    ? zones.map(z => ({ z, d: distKm(userPos.lat, userPos.lng, z.lat, z.lng) })).sort((a, b) => a.d - b.d)[0]
    : null;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg }}>
      <style>{`@keyframes zmPulse{0%,100%{opacity:1;r:7}50%{opacity:.55;r:9}}`}</style>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
        {/* graella de fons suau */}
        <defs>
          <pattern id="zmGrid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0H0V80" fill="none" stroke={C.border} strokeWidth="1" opacity="0.35" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={VBW} height={VBH} fill="url(#zmGrid)" />

        {/* línia usuari → zona més propera */}
        {userXY && nearest && (() => {
          const [zx, zy] = project(nearest.z.lat, nearest.z.lng);
          return <line x1={userXY[0]} y1={userXY[1]} x2={zx} y2={zy} stroke={USER_COLOR} strokeWidth="2" strokeDasharray="6 6" opacity="0.5" />;
        })()}

        {/* zones */}
        {zones.map((z) => {
          const [x, y] = project(z.lat, z.lng);
          const p = probs[z.id] || 0;
          const risk = p >= riskThreshold;
          const r = Math.max(14, (z.rKm || 5) * kmToVB);
          const col = risk ? C.danger : C.accent;
          const isSel = z.id === selected;
          const d = distOf(z);
          return (
            <g key={z.id} onClick={() => onSelect && onSelect(z.id)} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r={r} fill={col} fillOpacity={0.10 + p * 0.30}
                stroke={col} strokeWidth={isSel ? 4 : 2} strokeOpacity={isSel ? 1 : 0.7} />
              {risk && <circle cx={x} cy={y} r={r} fill="none" stroke={C.danger} strokeWidth="1.5" opacity="0.5" />}
              <circle cx={x} cy={y} r={4} fill={col} />
              <text x={x} y={y - r - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill={C.text} style={{ pointerEvents: "none" }}>
                {z.label || z.id}
              </text>
              <text x={x} y={y - r - 6 + 20} textAnchor="middle" fontSize="17" fontWeight="800" fill={col} style={{ pointerEvents: "none" }}>
                {Math.round(p * 100)}%{d != null ? ` · ${d}km` : ""}
              </text>
            </g>
          );
        })}

        {/* deteccions 24h */}
        {recentDets.map((d, i) => {
          const [x, y] = project(d._lat, d._lng);
          const col = PT[d.patrol_type]?.color || C.textDim;
          return <circle key={`d-${d.id || i}`} cx={x} cy={y} r={d._exact ? 6 : 4} fill={col} fillOpacity={d._exact ? 0.85 : 0.5} stroke={C.bg} strokeWidth="1.5" />;
        })}

        {/* usuari */}
        {userXY && (
          <g>
            {userAccR > 8 && <circle cx={userXY[0]} cy={userXY[1]} r={userAccR} fill={USER_COLOR} fillOpacity="0.10" stroke={USER_COLOR} strokeOpacity="0.4" strokeWidth="1.5" />}
            <circle cx={userXY[0]} cy={userXY[1]} r="11" fill={USER_COLOR} fillOpacity="0.25" />
            <circle cx={userXY[0]} cy={userXY[1]} r="7" fill={USER_COLOR} stroke="#fff" strokeWidth="2.5" style={{ animation: "zmPulse 1.8s infinite" }} />
          </g>
        )}
      </svg>

      {/* Botó localitza */}
      <button onClick={locate} disabled={locating} style={{
        position: "absolute", top: 10, right: 10, zIndex: 10,
        background: C.surface, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700,
        cursor: locating ? "wait" : "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,.4)",
      }}>
        {locating ? "⏳ Buscant…" : "📍 Jo"}
      </button>

      {/* Estat GPS / error */}
      {locErr ? (
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 10, background: C.danger, color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, maxWidth: 240, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>
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
            <div style={{ fontSize: 18, fontWeight: 800, color: (probs[nearest.z.id] || 0) >= riskThreshold ? C.danger : C.accent }}>{Math.round((probs[nearest.z.id] || 0) * 100)}%</div>
            <div style={{ fontSize: 12, color: C.textDim }}>a {Math.round(nearest.d * 10) / 10} km</div>
          </div>
        </div>
      )}
    </div>
  );
}
