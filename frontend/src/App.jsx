import { useState, useEffect, useRef } from "react";

const COLORS = {
  bg: "#0a0c10",
  surface: "#111318",
  surfaceHover: "#181c24",
  border: "#1e2530",
  accent: "#f5a623",
  accentDim: "#f5a62322",
  accentGlow: "#f5a62355",
  mossos: "#3b82f6",
  guardia: "#22c55e",
  local: "#a855f7",
  text: "#e8eaf0",
  textDim: "#6b7280",
  textMuted: "#3d4452",
  danger: "#ef4444",
  warning: "#f59e0b",
  success: "#10b981",
};

const ZONES = [
  "N-II (Lleida centre)", "C-13 (cap al nord)", "C-14 (Ponts/Balaguer)",
  "C-26 (Balaguer)", "A-2 (autopista)", "Lleida ciutat - Centre",
  "Lleida ciutat - Cappont", "Lleida ciutat - Balàfia",
  "Mollerussa", "Tàrrega", "Balaguer", "La Seu d'Urgell",
  "Tremp", "Cervera", "Les Borges Blanques",
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const PATROL_TYPES = {
  mossos: { label: "Mossos d'Esquadra", color: COLORS.mossos, short: "MSE" },
  guardia: { label: "Guardia Civil", color: COLORS.guardia, short: "GC" },
  local: { label: "Policia Local", color: COLORS.local, short: "PL" },
};

// Simulated historical data
const generateHistoricalData = () => {
  const data = {};
  ZONES.forEach(zone => {
    data[zone] = {};
    HOURS.forEach(hour => {
      const base = Math.random();
      const rushBoost = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20) ? 0.3 : 0;
      const nightDrop = hour >= 1 && hour <= 5 ? -0.3 : 0;
      data[zone][hour] = {
        mossos: Math.max(0, Math.min(1, base * 0.7 + rushBoost + nightDrop + Math.random() * 0.2)),
        guardia: Math.max(0, Math.min(1, (base * 0.4) + rushBoost * 0.5 + nightDrop + Math.random() * 0.15)),
        local: zone.includes("Lleida ciutat") ? Math.max(0, Math.min(1, base * 0.6 + rushBoost + nightDrop)) : Math.random() * 0.1,
      };
    });
  });
  return data;
};

const historicalData = generateHistoricalData();

const recentDetections = [
  { id: 1, time: "14:32", zone: "N-II (Lleida centre)", type: "mossos", source: "Telegram", msg: "Mossos a la N-II a l'altura del km 456, cuidado", confidence: "alta" },
  { id: 2, time: "14:18", zone: "C-13 (cap al nord)", type: "guardia", source: "WhatsApp", msg: "Guardia civil en C-13 pasado Balaguer dirección norte", confidence: "alta" },
  { id: 3, time: "13:55", zone: "Lleida ciutat - Centre", type: "local", source: "Telegram", msg: "Policia local al carrer Major fent controls", confidence: "mitja" },
  { id: 4, time: "13:40", zone: "Mollerussa", type: "mossos", source: "WhatsApp", msg: "Patrulla mossos a la rotonda entrada Mollerussa", confidence: "alta" },
  { id: 5, time: "13:22", zone: "A-2 (autopista)", type: "guardia", source: "Telegram", msg: "GC a l'A2 km 450 amb radar mòbil", confidence: "alta" },
  { id: 6, time: "12:58", zone: "C-14 (Ponts/Balaguer)", type: "mossos", source: "WhatsApp", msg: "Mossos fent controls a Ponts", confidence: "baixa" },
];

const MapVisualization = ({ selectedZone, onSelectZone }) => {
  const zones = [
    { id: "N-II (Lleida centre)", x: 45, y: 55, r: 18, label: "N-II" },
    { id: "C-13 (cap al nord)", x: 52, y: 28, r: 14, label: "C-13 N" },
    { id: "C-14 (Ponts/Balaguer)", x: 62, y: 35, r: 13, label: "C-14" },
    { id: "C-26 (Balaguer)", x: 68, y: 42, r: 12, label: "C-26" },
    { id: "A-2 (autopista)", x: 30, y: 62, r: 16, label: "A-2" },
    { id: "Lleida ciutat - Centre", x: 50, y: 55, r: 22, label: "Lleida" },
    { id: "Mollerussa", x: 35, y: 65, r: 11, label: "Mollr." },
    { id: "Tàrrega", x: 25, y: 72, r: 10, label: "Tàrrega" },
    { id: "Balaguer", x: 65, y: 40, r: 11, label: "Balaguer" },
    { id: "La Seu d'Urgell", x: 72, y: 18, r: 10, label: "Seu U." },
    { id: "Tremp", x: 60, y: 22, r: 10, label: "Tremp" },
    { id: "Cervera", x: 22, y: 78, r: 9, label: "Cervera" },
  ];

  const currentHour = new Date().getHours();

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "70%", background: "#0d1117", borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
      <svg viewBox="0 0 100 80" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {/* Background grid */}
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 8} x2="100" y2={i * 8} stroke="#ffffff05" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`v${i}`} x1={i * 8} y1="0" x2={i * 8} y2="80" stroke="#ffffff05" strokeWidth="0.3" />
        ))}

        {/* Roads */}
        <line x1="10" y1="58" x2="90" y2="52" stroke="#ffffff08" strokeWidth="1.5" />
        <line x1="50" y1="15" x2="52" y2="75" stroke="#ffffff08" strokeWidth="1.2" />
        <line x1="45" y1="55" x2="75" y2="35" stroke="#ffffff06" strokeWidth="1" />

        {zones.map(z => {
          const prob = historicalData[z.id]?.[currentHour];
          const maxProb = prob ? Math.max(prob.mossos, prob.guardia, prob.local) : 0;
          const isSelected = selectedZone === z.id;
          const color = maxProb > 0.6 ? COLORS.danger : maxProb > 0.35 ? COLORS.warning : COLORS.success;

          return (
            <g key={z.id} onClick={() => onSelectZone(z.id)} style={{ cursor: "pointer" }}>
              {/* Pulse ring */}
              {maxProb > 0.5 && (
                <circle cx={z.x} cy={z.y} r={z.r + 4} fill="none" stroke={color} strokeWidth="0.5" opacity="0.4">
                  <animate attributeName="r" values={`${z.r + 2};${z.r + 8};${z.r + 2}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={z.x} cy={z.y} r={z.r}
                fill={isSelected ? `${color}33` : `${color}18`}
                stroke={isSelected ? color : `${color}66`}
                strokeWidth={isSelected ? 1.5 : 0.8}
              />
              <text x={z.x} y={z.y - 1} textAnchor="middle" dominantBaseline="middle" fill={COLORS.text} fontSize="2.8" fontWeight="600" style={{ pointerEvents: "none" }}>
                {z.label}
              </text>
              <text x={z.x} y={z.y + 3.5} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="2.2" style={{ pointerEvents: "none" }}>
                {Math.round(maxProb * 100)}%
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 12, fontSize: 11 }}>
        {[["#ef4444", ">60%"], ["#f59e0b", "35-60%"], ["#10b981", "<35%"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            <span style={{ color: COLORS.textDim }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProbabilityBar = ({ value, type }) => {
  const color = PATROL_TYPES[type].color;
  const pct = Math.round(value * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: COLORS.textDim }}>{PATROL_TYPES[type].label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: pct > 60 ? COLORS.danger : pct > 35 ? COLORS.warning : COLORS.success }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: `0 0 8px ${color}88`,
        }} />
      </div>
    </div>
  );
};

const HourlyChart = ({ zone }) => {
  if (!zone) return null;
  const data = historicalData[zone];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Probabilitat per hora — avui
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 60 }}>
        {HOURS.map(h => {
          const d = data[h];
          const max = Math.max(d.mossos, d.guardia, d.local);
          const isNow = h === new Date().getHours();
          const color = max > 0.6 ? COLORS.danger : max > 0.35 ? COLORS.warning : COLORS.success;
          return (
            <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{
                width: "100%",
                height: Math.round(max * 50),
                background: isNow ? COLORS.accent : color,
                borderRadius: "2px 2px 0 0",
                opacity: isNow ? 1 : 0.6,
                boxShadow: isNow ? `0 0 6px ${COLORS.accent}` : "none",
                transition: "height 0.4s ease",
              }} />
              {h % 6 === 0 && (
                <span style={{ fontSize: 8, color: COLORS.textMuted }}>{h}h</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [selectedZone, setSelectedZone] = useState("N-II (Lleida centre)");
  const [queryZone, setQueryZone] = useState("N-II (Lleida centre)");
  const [queryHour, setQueryHour] = useState(new Date().getHours());
  const [queryResult, setQueryResult] = useState(null);
  const [sources, setSources] = useState({ telegram: true, whatsapp: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const currentHour = new Date().getHours();
  const currentData = historicalData[selectedZone]?.[currentHour] || {};

  const handleQuery = () => {
    const d = historicalData[queryZone]?.[queryHour] || {};
    setQueryResult({
      zone: queryZone,
      hour: queryHour,
      mossos: d.mossos || 0,
      guardia: d.guardia || 0,
      local: d.local || 0,
      overall: Math.max(d.mossos || 0, d.guardia || 0, d.local || 0),
    });
  };

  const tabs = [
    { id: "dashboard", icon: "◉", label: "Mapa" },
    { id: "query", icon: "⊙", label: "Consulta" },
    { id: "history", icon: "≡", label: "Historial" },
    { id: "config", icon: "⚙", label: "Config" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: COLORS.surface,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accent, boxShadow: `0 0 8px ${COLORS.accent}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accent }}>
                <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
              </div>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.05em", color: COLORS.accent }}>
              PATROL<span style={{ color: COLORS.textDim }}>TRACK</span>
            </span>
            <span style={{ fontSize: 11, color: COLORS.textDim, background: COLORS.border, padding: "2px 8px", borderRadius: 4 }}>
              Lleida · BETA
            </span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
            {sources.telegram && "● TG"} {sources.whatsapp && "● WA"} · Actiu
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>
            {new Date().toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textDim }}>
            {new Date().toLocaleDateString("ca-ES", { weekday: "short", day: "numeric", month: "short" })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "16px 16px 80px", overflowY: "auto" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <MapVisualization selectedZone={selectedZone} onSelectZone={setSelectedZone} />

            {/* Zone detail */}
            <div style={{ marginTop: 12, background: COLORS.surface, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{selectedZone}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>Ara · {currentHour}:00h</div>
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 800,
                  color: Math.max(...Object.values(currentData)) > 0.6 ? COLORS.danger :
                    Math.max(...Object.values(currentData)) > 0.35 ? COLORS.warning : COLORS.success
                }}>
                  {Math.round(Math.max(...Object.values(currentData)) * 100)}%
                </div>
              </div>

              <ProbabilityBar value={currentData.mossos || 0} type="mossos" />
              <ProbabilityBar value={currentData.guardia || 0} type="guardia" />
              <ProbabilityBar value={currentData.local || 0} type="local" />

              <HourlyChart zone={selectedZone} />
            </div>

            {/* Recent detections */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Últimes deteccions
              </div>
              {recentDetections.slice(0, 4).map(d => (
                <div key={d.id} style={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderLeft: `3px solid ${PATROL_TYPES[d.type].color}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setSelectedZone(d.zone)}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: PATROL_TYPES[d.type].color, background: `${PATROL_TYPES[d.type].color}22`, padding: "1px 6px", borderRadius: 3 }}>
                        {PATROL_TYPES[d.type].short}
                      </span>
                      <span style={{ fontSize: 11, color: COLORS.textDim }}>{d.zone}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: COLORS.textMuted }}>{d.source}</span>
                      <span style={{ fontSize: 11, color: COLORS.accent }}>{d.time}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textDim, fontStyle: "italic" }}>"{d.msg}"</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QUERY */}
        {tab === "query" && (
          <div>
            <div style={{ background: COLORS.surface, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}`, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: COLORS.accent }}>
                Consulta de probabilitat
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                  Zona
                </label>
                <select
                  value={queryZone}
                  onChange={e => setQueryZone(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", background: COLORS.bg, color: COLORS.text,
                    border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, outline: "none",
                    fontFamily: "inherit",
                  }}
                >
                  {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                  Hora — {queryHour}:00h
                </label>
                <input
                  type="range" min={0} max={23} value={queryHour}
                  onChange={e => setQueryHour(Number(e.target.value))}
                  style={{ width: "100%", accentColor: COLORS.accent }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                  <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
                </div>
              </div>

              <button
                onClick={handleQuery}
                style={{
                  width: "100%", padding: "12px", background: COLORS.accent, color: "#000",
                  border: "none", borderRadius: 8, fontSize: 14, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.05em",
                }}
              >
                CONSULTAR
              </button>
            </div>

            {queryResult && (
              <div style={{ background: COLORS.surface, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}` }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>
                    {queryResult.zone} · {queryResult.hour}:00h
                  </div>
                  <div style={{
                    fontSize: 64, fontWeight: 900, lineHeight: 1,
                    color: queryResult.overall > 0.6 ? COLORS.danger : queryResult.overall > 0.35 ? COLORS.warning : COLORS.success,
                    textShadow: `0 0 30px currentColor`,
                  }}>
                    {Math.round(queryResult.overall * 100)}%
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>
                    probabilitat de patrulla
                  </div>
                </div>

                <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12 }}>
                  <ProbabilityBar value={queryResult.mossos} type="mossos" />
                  <ProbabilityBar value={queryResult.guardia} type="guardia" />
                  <ProbabilityBar value={queryResult.local} type="local" />
                </div>

                <div style={{ marginTop: 12, padding: 10, background: COLORS.accentDim, borderRadius: 8, border: `1px solid ${COLORS.accentGlow}` }}>
                  <div style={{ fontSize: 11, color: COLORS.accent, fontWeight: 700 }}>
                    {queryResult.overall > 0.6 ? "⚠ Alta probabilitat de patrulla" :
                      queryResult.overall > 0.35 ? "◎ Probabilitat moderada" :
                        "✓ Baixa probabilitat de patrulla"}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>
                    Basat en {Math.floor(Math.random() * 200 + 50)} registres històrics
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Totes les deteccions · avui
            </div>
            {recentDetections.map(d => (
              <div key={d.id} style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderLeft: `3px solid ${PATROL_TYPES[d.type].color}`,
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: PATROL_TYPES[d.type].color, background: `${PATROL_TYPES[d.type].color}22`, padding: "2px 7px", borderRadius: 3 }}>
                      {PATROL_TYPES[d.type].label}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: COLORS.accent, fontWeight: 700 }}>{d.time}</span>
                </div>
                <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 4 }}>{d.zone}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim, fontStyle: "italic", marginBottom: 6 }}>"{d.msg}"</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.textMuted, background: COLORS.border, padding: "2px 6px", borderRadius: 3 }}>
                    via {d.source}
                  </span>
                  <span style={{ fontSize: 10, color: d.confidence === "alta" ? COLORS.success : d.confidence === "mitja" ? COLORS.warning : COLORS.textMuted, background: COLORS.border, padding: "2px 6px", borderRadius: 3 }}>
                    conf. {d.confidence}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CONFIG */}
        {tab === "config" && (
          <div>
            <div style={{ background: COLORS.surface, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}`, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: COLORS.accent }}>Fonts de dades</div>

              {[
                { key: "telegram", label: "Telegram", icon: "✈", status: "Connectat · 3 grups", statusColor: COLORS.success },
                { key: "whatsapp", label: "WhatsApp", icon: "◎", status: "Connectat via Web · 3 grups", statusColor: COLORS.success },
              ].map(s => (
                <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: COLORS.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                      {s.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: s.statusColor }}>{s.status}</div>
                    </div>
                  </div>
                  <div
                    onClick={() => setSources(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: sources[s.key] ? COLORS.accent : COLORS.border,
                      position: "relative", cursor: "pointer", transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: sources[s.key] ? 22 : 2,
                      width: 20, height: 20, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s",
                    }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: COLORS.surface, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: COLORS.accent }}>Grups actius</div>
              {["Grup TG Lleida · 847 membres", "Grup TG Ponent · 1.2K membres", "Grup WA Carreteres · 340 membres"].map(g => (
                <div key={g} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                  <span style={{ fontSize: 12, color: COLORS.textDim }}>{g}</span>
                  <span style={{ fontSize: 10, color: COLORS.success, background: `${COLORS.success}22`, padding: "2px 8px", borderRadius: 3 }}>Actiu</span>
                </div>
              ))}
              <button style={{
                marginTop: 12, width: "100%", padding: 10, background: "transparent",
                border: `1px dashed ${COLORS.border}`, borderRadius: 8, color: COLORS.textDim,
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>
                + Afegir grup
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        display: "flex",
        padding: "8px 0 12px",
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "6px 0",
            }}
          >
            <span style={{ fontSize: 18, color: tab === t.id ? COLORS.accent : COLORS.textMuted }}>
              {t.icon}
            </span>
            <span style={{ fontSize: 10, color: tab === t.id ? COLORS.accent : COLORS.textMuted, letterSpacing: "0.05em" }}>
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
