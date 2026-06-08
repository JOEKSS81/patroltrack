import { useC } from "../lib/themes";
import { ptWith } from "../lib/constants";

// Pestanya RADAR — UI pura. Tot l'estat ve del hook useRadar via props.
export default function RadarTab({ radar, dogPhoto = "/dog.png", onDetTap }) {
  const C = useC();
  const PT = ptWith(C);
  const {
    active, pos, err, nearby, sound, toggleSound,
    alertRadiusKm, setAlertRadiusKm, windowMin, setWindowMin, start, stop,
  } = radar;

  return (
    <div>
      <div style={{ background: C.surface, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.accent }}>🐕 Radar GPS</div>
        <button onClick={active ? stop : start} style={{ width: "100%", padding: 14, background: active ? C.danger : C.success, color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 12, boxShadow: active ? `0 0 20px ${C.danger}66` : `0 0 20px ${C.success}66` }}>
          {active ? "⏹ ATURAR RADAR" : "▶ ACTIVAR RADAR GPS"}
        </button>
        {err && (
          <div style={{ background: `${C.danger}22`, border: `1px solid ${C.danger}`, borderRadius: 8, padding: 10, fontSize: 13, color: C.danger, marginBottom: 12 }}>⚠ {err}</div>
        )}
        {pos && (
          <div style={{ background: C.bg, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
            <div style={{ color: C.textDim, marginBottom: 3 }}>📍 Posició actual</div>
            <div style={{ color: C.text }}>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div>
            <div style={{ color: C.textDim, marginTop: 2 }}>Precisió: ±{Math.round(pos.acc)}m</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: C.textDim }}>🔊 Lladruc d'alerta</span>
          <div onClick={toggleSound} style={{ width: 44, height: 24, borderRadius: 12, background: sound ? C.accent : C.border, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
            <div style={{ position: "absolute", top: 2, left: sound ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: C.textDim }}>Radi d'alerta</span>
            <span style={{ fontSize: 14, color: C.accent, fontWeight: 700 }}>{alertRadiusKm} km</span>
          </div>
          <input type="range" min={1} max={20} value={alertRadiusKm} onChange={e => setAlertRadiusKm(Number(e.target.value))} style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            <span>Just al costat</span><span>Comarca sencera</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: C.textDim }}>Finestra recent</span>
            <span style={{ fontSize: 14, color: C.accent, fontWeight: 700 }}>{windowMin} min</span>
          </div>
          <input type="range" min={15} max={240} step={15} value={windowMin} onChange={e => setWindowMin(Number(e.target.value))} style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            <span>15 min</span><span>4h</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 10, lineHeight: 1.5 }}>
          ↳ Alerta quan una <b style={{ color: C.textDim }}>detecció real</b> apareix dins de <b style={{ color: C.textDim }}>{alertRadiusKm} km</b> teus en els darrers <b style={{ color: C.textDim }}>{windowMin} min</b>.
        </div>
      </div>

      {active && (
        <div>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", justifyContent: "space-between" }}>
            <span>Deteccions recents prop teu</span>
            <span style={{ color: C.textMuted, letterSpacing: 0 }}>{nearby.length} en {windowMin} min</span>
          </div>
          {nearby.length === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: C.textDim }}>Cap detecció recent a la zona ✓</div>
            </div>
          ) : nearby.slice(0, 8).map((d, i) => {
            const ptype = PT[d.patrol_type] || PT.unknown;
            const isDanger = d._dist <= alertRadiusKm;
            const time = d.created_at ? new Date(d.created_at).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }) : "?";
            return (
              <div key={i} onClick={() => onDetTap && onDetTap(d)} style={{ background: isDanger ? `${C.danger}22` : C.surface, border: `1px solid ${isDanger ? C.danger : C.border}`, borderLeft: `3px solid ${ptype.color}`, borderRadius: 8, padding: "10px 12px", marginBottom: 6, boxShadow: isDanger ? `0 0 12px ${C.danger}44` : "none", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ptype.color, background: `${ptype.color}22`, padding: "1px 7px", borderRadius: 3 }}>{ptype.short}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: isDanger ? C.danger : C.text }}>{d._dist} km</span>
                </div>
                <div style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>
                  {d.zone_norm || d.zone || "?"}
                  {!d._exact && <span style={{ fontSize: 11, color: C.textMuted }}> · pos. aprox.</span>}
                </div>
                {d.raw_message && (
                  <div style={{ fontSize: 11, color: C.textDim, fontStyle: "italic", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    "{d.raw_message.substring(0, 60)}"
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textMuted }}>
                  <span>{isDanger ? "🚨 dins del radi" : "📍 fora del radi"}</span>
                  <span>fa {d._ageMin} min · {time}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!active && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, textAlign: "center" }}>
          <img src={dogPhoto} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", objectPosition: "center 20%", marginBottom: 12, border: `2px solid ${C.accent}55` }} />
          <div style={{ fontSize: 15, color: C.text, fontWeight: 700, marginBottom: 6 }}>Radar de patrulles</div>
          <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.7 }}>
            Activa el radar per rebre alertes automàtiques quan una detecció REAL aparegui prop teu. Et lladrarà quan hi hagi perill!
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.02)}}`}</style>
    </div>
  );
}
