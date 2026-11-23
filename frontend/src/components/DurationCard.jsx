import { useC } from "../lib/themes";
import { ptWith } from "../lib/constants";
import { durText, hhmm } from "../lib/risk";

// "Quant duren els controls": el que el model ha après dels avisos.
// Durada = del primer avís fins que algú diu "ja han marxat" (o, si ningú ho diu,
// fins a l'últim "segueixen" + un marge). És la base del % de possibilitat.
export default function DurationCard({ risk }) {
  const C = useC();
  const PT = ptWith(C);
  if (!risk || !risk.model) return null;
  const m = risk.model;
  const measured = (m.measured_complete || 0) + (m.measured_partial || 0);
  const recent = (risk.recent || []).slice(0, 6);
  const zones = (risk.zone_durations || []).slice(0, 5);
  const box = { background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 };
  const day = (iso) => new Date(iso).toLocaleDateString("ca-ES", { weekday: "short", day: "numeric" });

  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 13, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>⏱ Quant dura un control</span>
        <span style={{ fontSize: 22, fontWeight: 900, color: C.accent }}>~{durText(m.duration_min)}</span>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>
        {measured
          ? <>Mesurat en {measured} control{measured === 1 ? "" : "s"}: {m.measured_complete || 0} fins al «ja han marxat» i {m.measured_partial || 0} fins a l'últim «segueixen». Amb poques dades es parteix d'1 h.</>
          : <>Encara no s'ha pogut mesurar cap control: es fa servir 1 h. Quan algú escrigui «segueixen» o «ja han marxat» als grups, s'anirà afinant.</>}
      </div>

      {zones.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {zones.map((z) => (
            <span key={z.zone} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, color: C.text }}>
              {z.zone} <b style={{ color: C.accent }}>~{durText(z.minutes)}</b>
            </span>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 5 }}>Últims controls</div>
          {recent.map((e, i) => {
            const pt = PT[e.type] || PT.unknown;
            const how = e.measured === "complet" ? <b style={{ color: C.success }}>{durText(e.duration_min)}</b>
              : e.measured === "parcial" ? <span style={{ color: C.warning }}>+{durText(e.min_duration_min)}</span>
              : <span style={{ color: C.textMuted }}>1 avís</span>;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i ? `1px solid ${C.border}` : "none", fontSize: 12.5 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: pt.color, background: `${pt.color}22`, padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>{pt.short}</span>
                <span style={{ flex: 1, minWidth: 0, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.zone === "Desconeguda" ? "Zona desconeguda" : e.zone}
                  <span style={{ color: C.textMuted }}> · {day(e.started_at)} {hhmm(e.started_at)}{e.groups > 1 ? ` · ${e.groups} grups` : ""}</span>
                </span>
                <span style={{ flexShrink: 0 }}>{how}</span>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>Verd: mesurat fins al final · groc: com a mínim (no s'ha dit que marxessin)</div>
        </div>
      )}
    </div>
  );
}
