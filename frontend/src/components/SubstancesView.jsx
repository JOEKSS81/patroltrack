import { useState } from "react";
import { useC } from "../lib/themes";
import { SUBSTANCES } from "../lib/substances";

// Substàncies: quant dura l'EFECTE i quant temps es DETECTA (saliva, sang, orina).
// Missatge clau: efecte acabat ≠ net. A la carretera es sanciona la presència.
const LS = "pt_subs";
const AX_MIN = 0.5, AX_MAX = 720; // de 30 min a 30 dies, en escala logarítmica
const TICKS = [[1, "1h"], [6, "6h"], [24, "1 dia"], [72, "3d"], [168, "7d"], [720, "30d"]];

export default function SubstancesView() {
  const C = useC();
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } })();
  const [key, setKeyRaw] = useState(SUBSTANCES[saved.key] ? saved.key : "cannabis");
  const [freq, setFreqRaw] = useState(saved.freq === "frequent" ? "frequent" : "occasional");
  const persist = (k, f) => { try { localStorage.setItem(LS, JSON.stringify({ key: k, freq: f })); } catch { /* */ } };
  const setKey = (k) => { setKeyRaw(k); persist(k, freq); };
  const setFreq = (f) => { setFreqRaw(f); persist(key, f); };

  const sub = SUBSTANCES[key];
  const p = sub[freq];
  const box = { background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 };
  const label = { fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 };
  const chip = (on) => ({ flex: 1, padding: "9px 6px", borderRadius: 8, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentDim : "transparent", color: on ? C.accent : C.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  const rows = [
    { id: "effect", name: "Efecte (et notes)", range: p.effect, txt: p.effectTxt, col: C.success },
    { id: "saliva", name: "Saliva · control", range: p.saliva, txt: p.salivaTxt, col: C.danger },
    { id: "blood", name: "Sang", range: p.blood, txt: p.bloodTxt, col: C.warning },
    { id: "urine", name: "Orina", range: p.urine, txt: p.urineTxt, col: C.textDim },
  ];

  return (
    <div style={{ textAlign: "left" }}>
      <div style={{ ...box, borderLeft: `4px solid ${C.danger}` }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Efecte acabat ≠ net</div>
        <div style={{ fontSize: 13, color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>
          Als controls de drogues es fa un test de saliva i se sanciona que la substància <b style={{ color: C.text }}>hi sigui</b>, encara que ja no en notis l'efecte:
          <b style={{ color: C.text }}> 1.000 € i 6 punts</b>.
        </div>
      </div>

      <div style={box}>
        <div style={label}>Consum</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setFreq("occasional")} style={chip(freq === "occasional")}>Puntual</button>
          <button onClick={() => setFreq("frequent")} style={chip(freq === "frequent")}>Habitual</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {Object.entries(SUBSTANCES).map(([k, s]) => (
            <button key={k} onClick={() => setKey(k)} style={{ ...chip(k === key), flex: "none", padding: "8px 4px", fontSize: 12.5 }}>{s.short}</button>
          ))}
        </div>
      </div>

      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{sub.name}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3, lineHeight: 1.45 }}>{sub.mechanism}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 7px", flexShrink: 0, textAlign: "center" }}>{p.risk}</span>
        </div>

        <div style={{ ...label, marginTop: 14 }}>Quant dura · {freq === "frequent" ? "consum habitual" : "consum puntual"}</div>
        <Timeline C={C} rows={rows} />

        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, fontSize: 12.5, color: C.textDim, lineHeight: 1.5 }}>
          ⚠ {p.warning}
        </div>
      </div>

      <div style={box}>
        <div style={label}>Barrejat amb alcohol</div>
        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>{sub.synergy}</div>
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, padding: "4px 4px 0" }}>
        ⚠ <b style={{ color: C.textDim }}>Rangs orientatius:</b> depenen de la dosi, la puresa, el metabolisme i la freqüència. El final del rang no és cap garantia.
        <b style={{ color: C.textDim }}> Si has consumit, no condueixis.</b>
      </div>
    </div>
  );
}

// Barres horitzontals en escala logarítmica (30 min → 1 mes). Tram sòlid fins al
// mínim del rang i tram suau fins al màxim ("pot arribar fins a"). Cada fila porta
// el seu nom i el rang escrit: el color no és l'única pista.
function Timeline({ C, rows }) {
  const W = 340, rowH = 40, top = 6, bottom = 22, left = 6, right = 8;
  const H = top + rows.length * rowH + bottom;
  const pw = W - left - right;
  const lx = (h) => left + ((Math.log10(Math.max(AX_MIN, Math.min(AX_MAX, h))) - Math.log10(AX_MIN)) / (Math.log10(AX_MAX) - Math.log10(AX_MIN))) * pw;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label={rows.map((r) => `${r.name}: ${r.txt}`).join(". ")}>
      {TICKS.map(([h, t]) => (
        <g key={h}>
          <line x1={lx(h)} x2={lx(h)} y1={top} y2={H - bottom} stroke={C.border} strokeWidth="1" opacity="0.35" />
          <text x={lx(h)} y={H - 7} fontSize="9" fill={C.textMuted} textAnchor={h === AX_MAX ? "end" : "middle"}>{t}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = top + i * rowH;
        const x0 = lx(AX_MIN), x1 = lx(r.range[0]), x2 = lx(r.range[1]);
        return (
          <g key={r.id}>
            <text x={left} y={y + 11} fontSize="10.5" fontWeight="700" fill={C.text}>{r.name}</text>
            <text x={W - right} y={y + 11} fontSize="10.5" fill={C.textDim} textAnchor="end">{r.txt}</text>
            <rect x={x0} y={y + 17} width={Math.max(4, x1 - x0)} height="10" rx="4" fill={r.col} />
            {x2 > x1 + 1 && <rect x={x1 + 2} y={y + 17} width={x2 - x1 - 2} height="10" rx="4" fill={r.col} opacity="0.35" />}
          </g>
        );
      })}
    </svg>
  );
}
