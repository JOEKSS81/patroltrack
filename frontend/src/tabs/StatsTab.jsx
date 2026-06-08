import { useState } from "react";
import { useC } from "../lib/themes";
import { ptWith, DAYS_SHORT, DAYS_FULL, MONTHS } from "../lib/constants";

// Pestanya ESTADÍSTIQUES — Distribució i Calendari fusionats amb sub-toggle.
export default function StatsTab({ detections, onZoneTap, onDetTap }) {
  const C = useC();
  const PT = ptWith(C);
  const [view, setView] = useState("dist");          // "dist" | "cal"
  const [selDay, setSelDay] = useState(-1);          // -1 = tots
  const [selHour, setSelHour] = useState(-1);

  // ── Agregats globals (per vista Distribució) ─────────────────────────────
  const filtered = detections.filter(d => {
    const dt = d.created_at ? new Date(d.created_at) : null;
    if (!dt) return false;
    if (selDay >= 0 && dt.getDay() !== selDay) return false;
    if (selHour >= 0 && dt.getHours() !== selHour) return false;
    return true;
  });

  const byHour = Array(24).fill(0);
  detections.forEach(d => { if (d.created_at) byHour[new Date(d.created_at).getHours()]++; });
  const maxH = Math.max(...byHour, 1);

  const byDay = Array(7).fill(0);
  detections.forEach(d => { if (d.created_at) byDay[new Date(d.created_at).getDay()]++; });
  const maxD = Math.max(...byDay, 1);

  const zoneCount = {};
  detections.forEach(d => { const z = d.zone_norm || d.zone || "?"; zoneCount[z] = (zoneCount[z] || 0) + 1; });
  const topZones = Object.entries(zoneCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const typeCount = { mossos: 0, guardia: 0, local: 0, unknown: 0 };
  detections.forEach(d => { typeCount[d.patrol_type] = (typeCount[d.patrol_type] || 0) + 1; });

  // ── Estat del calendari ───────────────────────────────────────────────────
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calDate, setCalDate] = useState(null);

  const detsByDate = {};
  detections.forEach(d => {
    if (!d.created_at) return;
    const dt = new Date(d.created_at);
    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    detsByDate[key] = (detsByDate[key] || []);
    detsByDate[key].push(d);
  });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const selKey = calDate ? `${calYear}-${calMonth}-${calDate}` : null;
  const selDets = selKey ? detsByDate[selKey] || [] : [];
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); setCalDate(null); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); setCalDate(null); };

  return (
    <div>
      {/* Toggle Distribució / Calendari */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, background: C.surface, padding: 4, borderRadius: 10, border: `1px solid ${C.border}` }}>
        {[["dist", "📊 Distribució"], ["cal", "📅 Calendari"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: "none", background: view === k ? C.accent : "transparent", color: view === k ? C.bg : C.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>{l}</button>
        ))}
      </div>

      {view === "cal" && (
        <>
          {/* Capçalera mes */}
          <div style={{ background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <button onClick={prevMonth} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, width: 32, height: 32, cursor: "pointer", fontSize: 18 }}>‹</button>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>{MONTHS[calMonth]} {calYear}</span>
              <button onClick={nextMonth} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, width: 32, height: 32, cursor: "pointer", fontSize: 18 }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
              {DAYS_SHORT.map(d => <div key={d} style={{ textAlign: "center", fontSize: 12, color: C.textDim, padding: "2px 0" }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const key = `${calYear}-${calMonth}-${day}`;
                const dets = detsByDate[key] || [];
                const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
                const isSel = calDate === day;
                const hasHigh = dets.some(d => d.confidence === "alta");
                const hasMid = dets.some(d => d.confidence === "mitja");
                const dotCol = hasHigh ? C.danger : hasMid ? C.warning : C.success;
                return (
                  <div key={i} onClick={() => setCalDate(isSel ? null : day)} style={{
                    textAlign: "center", padding: "6px 2px", borderRadius: 6, cursor: "pointer",
                    background: isSel ? C.accentDim : isToday ? `${C.accent}15` : "transparent",
                    border: `1px solid ${isSel ? C.accent : isToday ? `${C.accent}44` : C.border}`,
                    position: "relative",
                  }}>
                    <span style={{ fontSize: 15, color: isToday ? C.accent : isSel ? C.accent : C.text, fontWeight: isToday || isSel ? 700 : 400 }}>{day}</span>
                    {dets.length > 0 && (
                      <div style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 1 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: dotCol }} />
                        {dets.length > 1 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: dotCol, opacity: 0.6 }} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {calDate && (() => {
            const byTypeDay = { mossos: 0, guardia: 0, local: 0, unknown: 0 };
            selDets.forEach(d => { byTypeDay[d.patrol_type] = (byTypeDay[d.patrol_type] || 0) + 1; });
            const byHourDay = Array(24).fill(0);
            selDets.forEach(d => { if (d.created_at) byHourDay[new Date(d.created_at).getHours()]++; });
            const maxHDay = Math.max(...byHourDay, 1);
            const topZonesDay = {};
            selDets.forEach(d => { const z = d.zone_norm || d.zone || "?"; topZonesDay[z] = (topZonesDay[z] || 0) + 1; });
            const topZonesArr = Object.entries(topZonesDay).sort((a, b) => b[1] - a[1]).slice(0, 3);
            const dayLabel = `${calDate} de ${MONTHS[calMonth]}`;
            return (
              <div>
                {selDets.length === 0 ? (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 14, color: C.textDim }}>Cap detecció el {dayLabel}</div>
                    <div style={{ fontSize: 13, color: C.success, marginTop: 4 }}>Dia tranquil ✓</div>
                  </div>
                ) : (
                  <>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>📅 {dayLabel}</span>
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{selDets.length} {selDets.length === 1 ? "detecció" : "deteccions"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                        {Object.entries(byTypeDay).filter(([, n]) => n > 0).map(([t, n]) => {
                          const pt = PT[t] || PT.unknown;
                          return (<div key={t} style={{ background: `${pt.color}22`, color: pt.color, padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{pt.short} · {n}</div>);
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Distribució per hora</div>
                      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 42, background: C.bg, padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                        {byHourDay.map((n, h) => {
                          const v = n / maxHDay;
                          const col = v > 0.66 ? C.danger : v > 0.33 ? C.warning : C.success;
                          return (<div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, position: "relative" }}>
                            <div title={n > 0 ? `${h}h: ${n}` : `${h}h`} style={{ width: "100%", height: Math.round(v * 32) + 2, background: n > 0 ? col : C.border, opacity: n > 0 ? 0.85 : 0.25, borderRadius: "2px 2px 0 0" }} />
                            {h % 6 === 0 && <span style={{ fontSize: 8, color: C.textMuted }}>{h}</span>}
                          </div>);
                        })}
                      </div>
                      {topZonesArr.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Zones del dia</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {topZonesArr.map(([z, n]) => (
                              <div key={z} onClick={() => onZoneTap && onZoneTap(z)} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, cursor: "pointer" }}>
                                <span style={{ color: C.text }}>{z}</span>
                                <span style={{ color: C.accent, fontWeight: 700 }}>{n}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, textAlign: "right" }}>Toca una detecció per veure el detall complet</div>
                    {selDets.map((d, i) => {
                      const ptype = PT[d.patrol_type] || PT.unknown;
                      const time = d.created_at ? new Date(d.created_at).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }) : "??";
                      return (
                        <div key={i} onClick={() => onDetTap && onDetTap(d)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${ptype.color}`, borderRadius: 8, padding: 12, marginBottom: 8, cursor: "pointer", transition: "background .15s" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: ptype.color, background: `${ptype.color}22`, padding: "2px 7px", borderRadius: 3 }}>{ptype.label}</span>
                            <span style={{ fontSize: 14, color: C.accent, fontWeight: 700 }}>{time}</span>
                          </div>
                          <div style={{ fontSize: 14, color: C.text, marginBottom: 4 }}>{d.zone_norm || d.zone}</div>
                          {d.raw_message && <div style={{ fontSize: 13, color: C.textDim, fontStyle: "italic", marginBottom: 6 }}>"{d.raw_message.substring(0, 65)}"</div>}
                          <div style={{ display: "flex", gap: 8 }}>
                            <span style={{ fontSize: 12, color: C.textMuted, background: C.border, padding: "2px 6px", borderRadius: 3 }}>via {d.source?.toUpperCase()}</span>
                            <span style={{ fontSize: 12, color: d.confidence === "alta" ? C.success : d.confidence === "mitja" ? C.warning : C.textMuted, background: C.border, padding: "2px 6px", borderRadius: 3 }}>conf. {d.confidence}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })()}
        </>
      )}

      {view === "dist" && (
        <>
          {/* Gràfic per hora — barres amb color per intensitat + etiquetes */}
          <div style={{ background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>Deteccions per hora</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{detections.length} total · toca per filtrar</div>
            </div>
            <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 96 }}>
              {byHour.map((n, h) => {
                const isSel = selHour === h, isNow = h === new Date().getHours();
                const ratio = maxH > 0 ? n / maxH : 0;
                const baseCol = ratio > 0.66 ? C.danger : ratio > 0.33 ? C.warning : C.mossos;
                const col = (isSel || isNow) ? C.accent : baseCol;
                const barH = Math.round(ratio * 76) + 2;
                const showCount = n > 0 && (barH > 20 || n === maxH);
                return (
                  <div key={h} onClick={() => setSelHour(selHour === h ? -1 : h)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "pointer", position: "relative" }}>
                    {showCount && (
                      <span style={{ fontSize: 8, color: isSel || isNow ? C.accent : baseCol, fontWeight: 700, lineHeight: 1, marginBottom: 1 }}>{n}</span>
                    )}
                    {!showCount && <span style={{ fontSize: 8, color: "transparent" }}>0</span>}
                    <div style={{
                      width: "100%", height: barH,
                      background: col,
                      borderRadius: "3px 3px 0 0",
                      opacity: n === 0 ? 0.12 : isSel || isNow ? 1 : 0.8,
                      boxShadow: isSel ? `0 0 8px ${C.accent}` : isNow ? `0 0 6px ${C.accent}88` : "none",
                      transition: "height 0.4s",
                      outline: isNow && !isSel ? `1px solid ${C.accent}66` : "none",
                    }} />
                    {h % 3 === 0 && <span style={{ fontSize: 9, color: isNow ? C.accent : C.textMuted, marginTop: 2 }}>{h}h</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: C.textMuted, flexWrap: "wrap" }}>
              <span><span style={{ color: C.mossos }}>■</span> Baixa</span>
              <span><span style={{ color: C.warning }}>■</span> Moderada</span>
              <span><span style={{ color: C.danger }}>■</span> Alta</span>
              <span><span style={{ color: C.accent }}>■</span> Ara / seleccionat</span>
            </div>
            {selHour >= 0 && <div style={{ fontSize: 12, color: C.accent, marginTop: 6, textAlign: "center", background: C.accentDim, borderRadius: 6, padding: "4px 8px" }}>
              {selHour}:00h — {byHour[selHour]} deteccions · toca de nou per treure el filtre
            </div>}
          </div>

          {/* Gràfic per dia — barres amb recompte visible */}
          <div style={{ background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>Per dia de la setmana</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>toca per filtrar</div>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
              {byDay.map((n, d) => {
                const isSel = selDay === d, isToday = d === new Date().getDay();
                const ratio = maxD > 0 ? n / maxD : 0;
                const baseCol = ratio > 0.66 ? C.danger : ratio > 0.33 ? C.warning : C.guardia;
                const col = (isSel || isToday) ? C.accent : baseCol;
                const barH = Math.round(ratio * 64) + 4;
                return (
                  <div key={d} onClick={() => setSelDay(selDay === d ? -1 : d)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isSel || isToday ? C.accent : (n > 0 ? baseCol : C.textMuted) }}>{n > 0 ? n : ""}</span>
                    <div style={{
                      width: "100%", height: barH,
                      background: col,
                      borderRadius: "4px 4px 0 0",
                      opacity: n === 0 ? 0.12 : isSel || isToday ? 1 : 0.8,
                      boxShadow: isSel ? `0 0 8px ${C.accent}` : isToday ? `0 0 6px ${C.accent}88` : "none",
                      transition: "height 0.4s",
                    }} />
                    <span style={{ fontSize: 12, fontWeight: isSel || isToday ? 800 : 400, color: isSel ? C.accent : isToday ? C.accent : C.textDim }}>{DAYS_SHORT[d]}</span>
                  </div>
                );
              })}
            </div>
            {selDay >= 0 && <div style={{ fontSize: 12, color: C.accent, marginTop: 8, textAlign: "center", background: C.accentDim, borderRadius: 6, padding: "4px 8px" }}>
              {DAYS_FULL[selDay]} — {byDay[selDay]} deteccions · toca de nou per treure el filtre
            </div>}
          </div>

          {/* Top zones */}
          <div style={{ background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>Zones més actives</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>toca per veure detall</div>
            </div>
            {topZones.length === 0 ? <div style={{ fontSize: 13, color: C.textDim, textAlign: "center" }}>Sense dades</div> :
              topZones.map(([zone, count], i) => (
                <div key={i} onClick={() => onZoneTap && onZoneTap(zone)} style={{ marginBottom: 8, padding: "6px 8px", margin: "0 -8px 4px", borderRadius: 6, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 14, color: C.text }}>{zone}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>{count}</span>
                  </div>
                  <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / topZones[0][1]) * 100}%`, background: C.accent, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
          </div>

          {/* Per tipus */}
          <div style={{ background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 10 }}>Per tipus de patrulla</div>
            {Object.entries(typeCount).filter(([, n]) => n > 0).map(([type, n]) => (
              <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 14, color: PT[type]?.color || C.textDim }}>{PT[type]?.label || type}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{n}</span>
              </div>
            ))}
          </div>

          {/* Deteccions filtrades */}
          {(selDay >= 0 || selHour >= 0) && (
            <div>
              <div style={{ fontSize: 13, color: C.textDim, marginBottom: 8 }}>Deteccions filtrades ({filtered.length})</div>
              {filtered.slice(0, 10).map((d, i) => {
                const ptype = PT[d.patrol_type] || PT.unknown;
                const time = d.created_at ? new Date(d.created_at).toLocaleString("ca-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "??";
                return (
                  <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${ptype.color}`, borderRadius: 8, padding: "8px 10px", marginBottom: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: ptype.color }}>[{ptype.short}] {d.zone_norm || d.zone}</span>
                      <span style={{ fontSize: 12, color: C.accent }}>{time}</span>
                    </div>
                    {d.raw_message && <div style={{ fontSize: 12, color: C.textDim, fontStyle: "italic" }}>"{d.raw_message.substring(0, 50)}"</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
