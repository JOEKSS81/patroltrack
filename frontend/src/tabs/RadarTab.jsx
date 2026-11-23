import { useC } from "../lib/themes";
import { ptWith } from "../lib/constants";
import { RADIUS_CHOICES } from "../lib/useRadar";

// Pestanya RADAR — UI pura. Tot l'estat ve del hook useRadar via props.
// Disseny: un SEMÀFOR (avisos reals recents prop teu), el radi en 3 botons i la llista
// d'avisos "davant teu" (en la direcció que circules) i "a prop".
// El % que es mostra és només l'històric de la zona a aquesta hora (informatiu).
export default function RadarTab({ radar, dogPhoto, onDetTap }) {
  const C = useC();
  const PT = ptWith(C);
  const {
    active, pos, err, nearby, riskPct, zoneName, sound, toggleSound,
    alertRadiusKm, setAlertRadiusKm, start, stop, heading, level,
  } = radar;

  const ahead = nearby.filter(d => d._ahead && d._dist <= alertRadiusKm * 2);
  const around = nearby.filter(d => !ahead.includes(d) && d._dist <= alertRadiusKm * 2);
  const closest = (ahead[0] && ahead[0]._dist <= alertRadiusKm) ? ahead[0] : nearby.find(d => d._dist <= alertRadiusKm);

  const LIGHTS = {
    calm:    { col: C.success, icon: "🟢", title: "Tranquil",        sub: "Cap avís recent dins del radi" },
    caution: { col: C.warning, icon: "🟡", title: "Precaució",       sub: "Hi ha hagut activitat a la zona" },
    danger:  { col: C.danger,  icon: "🔴", title: "Control a prop!", sub: "Avís recent dins del radi" },
  };
  const L = LIGHTS[active ? level : "calm"];
  const pType = (d) => PT[d.patrol_type] || PT.unknown;
  const histCol = riskPct >= 40 ? C.warning : C.textDim;

  const Row = ({ d }) => {
    const t = pType(d);
    const inside = d._dist <= alertRadiusKm;
    const time = d.created_at ? new Date(d.created_at).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }) : "?";
    return (
      <div onClick={() => onDetTap && onDetTap(d)} style={{ background: inside ? `${C.danger}18` : C.surface, border: `1px solid ${inside ? C.danger + "88" : C.border}`, borderLeft: `3px solid ${t.color}`, borderRadius: 8, padding: "9px 12px", marginBottom: 6, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: t.color, background: `${t.color}22`, padding: "1px 7px", borderRadius: 3 }}>{t.short}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.zone_norm && d.zone_norm !== "Desconeguda" ? d.zone_norm : (d.zone || "Zona desconeguda")}
          </span>
          <span style={{ fontSize: 15, fontWeight: 900, color: inside ? C.danger : C.text }}>{d._dist} km</span>
        </div>
        {d.raw_message && (
          <div style={{ fontSize: 11.5, color: C.textDim, fontStyle: "italic", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{d.raw_message}"</div>
        )}
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>fa {d._ageMin} min · {time}{!d._exact ? " · posició aproximada" : ""}</div>
      </div>
    );
  };

  return (
    <div>
      {/* SEMÀFOR */}
      <div style={{ background: C.surface, borderRadius: 14, padding: 16, border: `1px solid ${active ? L.col + "88" : C.border}`, marginBottom: 12, boxShadow: active ? `0 0 24px ${L.col}33` : "none" }}>
        {active ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", flexShrink: 0, background: L.col, boxShadow: `0 0 26px ${L.col}aa`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, animation: level === "danger" ? "rdPulse 1s ease-in-out infinite alternate" : "none" }}>
              {level === "danger" ? "🚨" : level === "caution" ? "⚠" : "✓"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: L.col, lineHeight: 1.1 }}>{L.title}</div>
              <div style={{ fontSize: 13, color: C.textDim, marginTop: 4, lineHeight: 1.35 }}>
                {closest
                  ? <>{pType(closest).short} a <b style={{ color: C.text }}>{closest._dist} km</b>{closest._ahead ? " davant teu" : ""} · fa {closest._ageMin} min</>
                  : L.sub}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <img src={dogPhoto} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", objectPosition: "center 20%", border: `2px solid ${C.accent}55`, flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>
              Activa el radar i et dirà amb un <b style={{ color: C.text }}>semàfor</b> si hi ha controls reals a prop o en la direcció que circules. Lladra quan n'entra un dins del radi.
            </div>
          </div>
        )}

        <button onClick={active ? stop : start} style={{ width: "100%", padding: 14, background: active ? C.danger : C.success, color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 12, boxShadow: `0 0 18px ${(active ? C.danger : C.success)}55` }}>
          {active ? "⏹ ATURAR RADAR" : "▶ ACTIVAR RADAR"}
        </button>
        {err && <div style={{ background: `${C.danger}22`, border: `1px solid ${C.danger}`, borderRadius: 8, padding: 10, fontSize: 13, color: C.danger, marginBottom: 12 }}>⚠ {err}</div>}

        {/* Radi en 3 botons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: C.textDim, flexShrink: 0 }}>Avisa'm a</span>
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {RADIUS_CHOICES.map(km => (
              <button key={km} onClick={() => setAlertRadiusKm(km)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${alertRadiusKm === km ? C.accent : C.border}`, background: alertRadiusKm === km ? C.accent : "transparent", color: alertRadiusKm === km ? C.bg : C.textDim, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{km} km</button>
            ))}
          </div>
        </div>

        {/* So + dades de posició, en una línia */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.textDim }}>🔊 Lladruc</span>
            <div onClick={toggleSound} style={{ width: 44, height: 24, borderRadius: 12, background: sound ? C.accent : C.border, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
              <div style={{ position: "absolute", top: 2, left: sound ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </div>
          </div>
          {active && pos && (
            <div style={{ fontSize: 11, color: C.textMuted, textAlign: "right" }}>
              GPS ±{Math.round(pos.acc)} m{heading != null ? ` · ${["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(heading / 45) % 8]}` : " · aturat"}
            </div>
          )}
        </div>

        {active && zoneName && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.textDim, display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>📊 Històric a {zoneName} a aquesta hora</span>
            <b style={{ color: histCol }}>{riskPct}%</b>
          </div>
        )}
      </div>

      {/* Llistes */}
      {active && (
        <>
          {heading != null && (
            <>
              <div style={{ fontSize: 12, color: C.textDim, margin: "4px 0 8px", textTransform: "uppercase", letterSpacing: "0.1em" }}>⬆ Davant teu · darreres 2 h</div>
              {ahead.length ? ahead.slice(0, 6).map((d, i) => <Row key={`a${i}`} d={d} />) : (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 13, color: C.textDim, textAlign: "center" }}>Res en la direcció que vas ✓</div>
              )}
            </>
          )}
          <div style={{ fontSize: 12, color: C.textDim, margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {heading != null ? "↔ Al voltant" : "📍 A prop teu"} · darreres 2 h
          </div>
          {around.length ? around.slice(0, 6).map((d, i) => <Row key={`r${i}`} d={d} />) : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13, color: C.textDim, textAlign: "center" }}>Cap avís recent fins a {alertRadiusKm * 2} km ✓</div>
          )}
        </>
      )}

      <style>{`@keyframes rdPulse{from{transform:scale(1)}to{transform:scale(1.08)}}`}</style>
    </div>
  );
}
