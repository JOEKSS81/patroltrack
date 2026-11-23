import { useEffect, useMemo, useRef, useState } from "react";
import { useC } from "../lib/themes";
import Collapsible from "../components/Collapsible";
import SubstancesView from "../components/SubstancesView";
import { DRINKS, PRESETS, LIMITS, bacAt, simulate, fmtDur, clockPlus, hoursSince, level } from "../lib/alcohol";

// Números a la catalana: 0,77 en lloc de 0.77
const n2 = (v) => v.toFixed(2).replace(".", ",");
const n1 = (v) => v.toFixed(1).replace(".", ",");

// Pestanya ALCOHOL: quant de temps dura l'alcohol al cos i quan baixes de cada límit.
// Basat en el simulador BioClear ToxiScan (model de Widmark). És una estimació:
// l'única taxa segura per conduir és 0,0.
const LS = "pt_alcohol";
const MAX_H = 20;

const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || "null");
    if (!s) return null;
    // Les begudes només es recorden 24 h (la nit d'avui); el perfil, sempre.
    if (!s.savedAt || Date.now() - s.savedAt > 24 * 3600 * 1000) s.drinks = {};
    return s;
  } catch { return null; }
};
const nowHHMM = () => {
  const d = new Date();
  const m = Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// Dues parts: calculadora d'alcohol i finestres de detecció de substàncies.
export default function AlcoholTab() {
  const C = useC();
  const [mode, setModeRaw] = useState(() => { try { return localStorage.getItem("pt_alc_mode") || "alcohol"; } catch { return "alcohol"; } });
  const setMode = (m) => { setModeRaw(m); try { localStorage.setItem("pt_alc_mode", m); } catch { /* */ } };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, background: C.surface, padding: 4, borderRadius: 10, border: `1px solid ${C.border}` }}>
        {[["alcohol", "🍺 Alcohol"], ["subs", "💊 Substàncies"]].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: "none", background: mode === k ? C.accent : "transparent", color: mode === k ? C.bg : C.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {mode === "subs" ? <SubstancesView /> : <AlcoholView />}
    </div>
  );
}

function AlcoholView() {
  const C = useC();
  const [saved] = useState(load);
  const [sex, setSex] = useState(saved?.sex || "M");
  const [weight, setWeight] = useState(saved?.weight || 75);
  const [stomach, setStomach] = useState(saved?.stomach || "empty");
  const [start, setStart] = useState(saved?.start || nowHHMM());
  const [drinks, setDrinks] = useState(saved?.drinks || {});
  const [inspect, setInspect] = useState(null); // hora inspeccionada a la gràfica (null = ara)

  useEffect(() => {
    try { localStorage.setItem(LS, JSON.stringify({ sex, weight, stomach, start, drinks, savedAt: Date.now() })); } catch { /* */ }
  }, [sex, weight, stomach, start, drinks]);

  const profile = { sex, weight, stomach };
  const grams = DRINKS.reduce((a, d) => a + (drinks[d.id] || 0) * d.grams, 0);
  const sim = useMemo(() => simulate(grams, { sex, weight, stomach }), [grams, sex, weight, stomach]);
  const elapsed = hoursSince(start);
  const nowIn = grams > 0 && elapsed <= MAX_H ? elapsed : null;
  const nowBreath = nowIn != null ? bacAt(nowIn, grams, profile).breath : 0;

  const add = (id, d) => setDrinks((p) => ({ ...p, [id]: Math.max(0, Math.min(20, (p[id] || 0) + d)) }));
  const preset = (p) => { setDrinks({ ...p.drinks }); setStomach(p.stomach); };

  const box = { background: C.surface, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 };
  const label = { fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 };
  const chip = (on) => ({ flex: 1, padding: "9px 6px", borderRadius: 8, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentDim : "transparent", color: on ? C.accent : C.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const levelCol = (b) => ({ crime: C.danger, general: C.warning, novel: C.warning, low: C.text, zero: C.success }[level(b)]);

  // Missatge principal
  const banner = (() => {
    if (!grams) return { col: C.border, title: "Afegeix el que has begut", text: "Et dirà quan baixes de cada límit i a quina hora tornes a 0,00." };
    if (sim.peak >= LIMITS.crime) return { col: C.danger, title: `Delicte: pic de ${n2(sim.peak)} mg/L`, text: `Per sobre de 0,60 és delicte penal. No tornes a 0,00 fins a les ${clockPlus(start, sim.zero)}.` };
    if (sim.peak >= LIMITS.general) return { col: C.warning, title: `Positiu: pic de ${n2(sim.peak)} mg/L`, text: `Donaries positiu durant ${fmtDur(sim.under.general)} encara que et trobis bé. 0,00 a les ${clockPlus(start, sim.zero)}.` };
    if (sim.peak >= LIMITS.novel) return { col: C.warning, title: `Positiu per a novells i professionals (${n2(sim.peak)} mg/L)`, text: `Per sobre de 0,15. Els reflexos ja estan afectats. 0,00 a les ${clockPlus(start, sim.zero)}.` };
    return { col: C.success, title: `Taxa baixa (${n2(sim.peak)} mg/L)`, text: `Per sota dels límits, però l'alcohol ja afecta la vista. 0,00 a les ${clockPlus(start, sim.zero)}.` };
  })();

  return (
    <div style={{ textAlign: "left" }}>
      {/* Perfil */}
      <div style={box}>
        <div style={label}>El teu perfil</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => setSex("M")} style={chip(sex === "M")}>Home</button>
          <button onClick={() => setSex("F")} style={chip(sex === "F")}>Dona</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: C.textDim, flexShrink: 0 }}>Pes</span>
          <input type="range" min={40} max={160} value={weight} onChange={(e) => setWeight(Number(e.target.value))} style={{ flex: 1, accentColor: C.accent }} />
          <b style={{ fontSize: 15, color: C.text, minWidth: 52, textAlign: "right" }}>{weight} kg</b>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => setStomach("empty")} style={chip(stomach === "empty")}>En dejú</button>
          <button onClick={() => setStomach("full")} style={chip(stomach === "full")}>Amb menjar</button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.textDim }}>
          Vaig començar a beure a les
          <input type="time" value={start} onChange={(e) => setStart(e.target.value || "22:00")}
            style={{ padding: "6px 8px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 14, colorScheme: "dark" }} />
        </label>
      </div>

      {/* Begudes */}
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={label}>Què has begut</div>
          <span style={{ fontSize: 12, color: C.textDim }}>{n1(grams)} g · {n1(grams / 10)} UBE</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => preset(p)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{p.label}</button>
          ))}
          {grams > 0 && <button onClick={() => setDrinks({})} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Netejar</button>}
        </div>
        {DRINKS.map((d) => {
          const n = drinks[d.id] || 0;
          return (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>{d.detail} · {n1(d.grams)} g</div>
              </div>
              <button onClick={() => add(d.id, -1)} aria-label={`Treure ${d.name}`} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.textDim, fontSize: 18, fontWeight: 800, cursor: "pointer" }}>−</button>
              <b style={{ width: 20, textAlign: "center", fontSize: 16, color: n ? C.accent : C.textMuted }}>{n}</b>
              <button onClick={() => add(d.id, 1)} aria-label={`Afegir ${d.name}`} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentDim, color: C.accent, fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+</button>
            </div>
          );
        })}
      </div>

      {/* Resultat */}
      <div style={{ ...box, borderLeft: `4px solid ${banner.col}` }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{banner.title}</div>
        <div style={{ fontSize: 13, color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>{banner.text}</div>
        {nowIn != null && (
          <div style={{ fontSize: 13, color: C.textDim, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            Ara mateix (fa {fmtDur(nowIn)} que vas començar): <b style={{ color: levelCol(nowBreath) }}>{n2(nowBreath)} mg/L</b>
          </div>
        )}
      </div>

      {grams > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <Kpi C={C} big title="Fins a 0,00" value={fmtDur(sim.zero)} sub={`a les ${clockPlus(start, sim.zero)}`} col={C.success} />
          <Kpi C={C} big title="Pic" value={`${n2(sim.peak)} mg/L`} sub={`a les ${clockPlus(start, sim.peakTime)} · ${n2(sim.peakBlood)} g/L en sang`} col={levelCol(sim.peak)} />
        </div>
      )}

      {/* Gràfica */}
      <div style={box}>
        <div style={label}>Alcohol en aire espirat (mg/L) · {MAX_H} h des que comences</div>
        <Chart C={C} grams={grams} profile={profile} start={start} peak={sim.peak} nowIn={nowIn} inspect={inspect} setInspect={setInspect} />
        <input type="range" min={0} max={MAX_H} step={0.25} value={inspect ?? nowIn ?? 0} onChange={(e) => setInspect(Number(e.target.value))}
          aria-label="Hora a inspeccionar" style={{ width: "100%", accentColor: C.accent, marginTop: 6 }} />
      </div>

      {/* Límits, sancions i mites: plegat per no allargar la pantalla */}
      <div style={{ marginBottom: 10 }}>
        <Collapsible title="ℹ️ Límits, multes i mites" subtitle="0,25 general · 0,15 novells · 0,60 delicte" defaultOpen={false}>
          {[
            [C.warning, "0,15 mg/L", "Novells (2 primers anys) i professionals", "500 € i 4 punts"],
            [C.warning, "0,25 mg/L", "Conductors en general", "500 € i 4 punts · 1.000 € i 6 punts per sobre de 0,50"],
            [C.danger, "0,60 mg/L", "Delicte penal (art. 379 CP)", "Presó de 3 a 6 mesos o multa/treballs, i sense carnet d'1 a 4 anys"],
          ].map(([col, v, who, what]) => (
            <div key={v} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: `1px solid ${C.border}`, alignItems: "baseline" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: col, flexShrink: 0, alignSelf: "center" }} />
              <b style={{ fontSize: 13, color: C.text, minWidth: 74 }}>{v}</b>
              <span style={{ fontSize: 12, color: C.textDim, lineHeight: 1.4 }}>{who}<br /><span style={{ color: C.textMuted }}>{what}</span></span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "12px 0 4px" }}>Es pot baixar més de pressa? No</div>
          {[
            ["Aigua o cafè", "El fetge elimina l'alcohol a ritme fix: la taxa no baixa més de pressa."],
            ["Fer esport o suar", "Per la suor en surt menys del 5 %. Et deshidrata i pot concentrar més l'alcohol."],
            ["Xiclet o grans de cafè", "L'etilòmetre mesura l'aire del fons dels pulmons, no l'alè de la boca."],
            ["Dormir 4 o 5 hores", "Dormint no s'accelera. Molts positius greus són a les 8–10 h de l'endemà."],
          ].map(([t, d]) => (
            <div key={t} style={{ padding: "6px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.textDim, lineHeight: 1.45 }}>
              <b style={{ color: C.text }}>«{t}»</b> — {d}
            </div>
          ))}
        </Collapsible>
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, padding: "4px 4px 0" }}>
        ⚠ <b style={{ color: C.textDim }}>És una estimació</b> (model de Widmark). El fetge, la medicació, el cansament o el que has menjat ho canvien molt d'una persona a una altra.
        <b style={{ color: C.textDim }}> L'única taxa segura per conduir és 0,0: si has begut, no condueixis.</b>
      </div>
    </div>
  );
}

function Kpi({ C, title, value, sub, col, big }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: big ? 19 : 15, fontWeight: 900, color: C.text, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
        {col && <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />}
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

// Corba de la taxa en SVG: una sola sèrie (sense llegenda), llindars 0,15 / 0,25 / 0,60
// amb etiqueta en text neutre, i inspector: tocar o arrossegar sobre la gràfica.
function Chart({ C, grams, profile, start, peak, nowIn, inspect, setInspect }) {
  const W = 340, H = 200, pad = { t: 14, r: 10, b: 26, l: 36 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const maxY = Math.max(0.8, Math.ceil((peak + 0.15) * 10) / 10);
  const x = (h) => pad.l + (h / MAX_H) * pw;
  const y = (v) => pad.t + ph - (v / maxY) * ph;
  const svgRef = useRef(null);

  const pts = [];
  for (let h = 0; h <= MAX_H + 1e-9; h += 0.1) pts.push([x(h), y(bacAt(h, grams, profile).breath)]);
  const line = pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join("");
  const area = `${line}L${x(MAX_H)},${y(0)}L${x(0)},${y(0)}Z`;

  const at = inspect ?? nowIn;
  const atB = at != null ? bacAt(at, grams, profile).breath : 0;
  const lv = level(atB);
  const dotCol = lv === "crime" ? C.danger : lv === "general" || lv === "novel" ? C.warning : C.accent;
  const status = { crime: "delicte", general: "positiu", novel: "positiu novells", low: "per sota dels límits", zero: "0,00" }[lv];

  const pick = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setInspect(Math.round(Math.max(0, Math.min(MAX_H, ((px - pad.l) / pw) * MAX_H)) * 4) / 4);
  };
  const yTicks = [];
  for (let v = 0; v <= maxY + 1e-9; v += maxY > 1.2 ? 0.3 : 0.2) yTicks.push(v);
  const thresholds = [[LIMITS.novel, C.warning, "0,15 novells"], [LIMITS.general, C.warning, "0,25 general"], [LIMITS.crime, C.danger, "0,60 delicte"]];

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.textDim, minHeight: 18, marginBottom: 4 }}>
        {at != null && grams > 0
          ? <>{inspect == null ? "Ara" : `+${at.toFixed(at % 1 ? 2 : 0).replace(".", ",")} h`} · {clockPlus(start, at)} → <b style={{ color: C.text }}>{n2(atB)} mg/L</b> · {status}</>
          : grams > 0 ? "Toca la gràfica per veure una hora concreta" : "Afegeix begudes per veure la corba"}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); pick(e); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") pick(e); }}>
        <defs>
          <linearGradient id="alcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={C.border} strokeWidth="1" opacity="0.6" />
            <text x={pad.l - 5} y={y(v) + 3} fontSize="9" fill={C.textMuted} textAnchor="end">{n1(v)}</text>
          </g>
        ))}
        {[0, 4, 8, 12, 16, 20].map((h) => (
          <text key={h} x={x(h)} y={H - 8} fontSize="9" fill={C.textMuted} textAnchor="middle">+{h}h</text>
        ))}
        {thresholds.filter(([v]) => v <= maxY).map(([v, col, txt]) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={col} strokeWidth="1.2" strokeDasharray="4 4" opacity="0.85" />
            <text x={W - pad.r - 2} y={y(v) - 3} fontSize="9" fill={C.textDim} textAnchor="end">{txt}</text>
          </g>
        ))}
        {grams > 0 && <path d={area} fill="url(#alcFill)" />}
        {grams > 0 && <path d={line} fill="none" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" />}
        {nowIn != null && grams > 0 && (
          <g>
            <line x1={x(nowIn)} x2={x(nowIn)} y1={pad.t} y2={pad.t + ph} stroke={C.textDim} strokeWidth="1" strokeDasharray="2 3" />
            <text x={x(nowIn) + 3} y={pad.t + 8} fontSize="9" fill={C.textDim}>ara</text>
          </g>
        )}
        {at != null && grams > 0 && (
          <g>
            {inspect != null && <line x1={x(at)} x2={x(at)} y1={pad.t} y2={pad.t + ph} stroke={C.text} strokeWidth="1" opacity="0.4" />}
            <circle cx={x(at)} cy={y(atB)} r="5" fill={dotCol} stroke={C.surface} strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
}
