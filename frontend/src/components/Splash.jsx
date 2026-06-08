import { useC } from "../lib/themes";

// Splash d'auto-activació del Radar GPS. Apareix a l'arrencar l'app.
export default function Splash({ onActivate, onSkip, wasActive, dogPhoto }) {
  const C = useC();
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Mono','Courier New',monospace" }}>
      <img src={dogPhoto} alt="PatrolTrack" style={{ maxWidth: "min(85vw,360px)", maxHeight: "50vh", width: "auto", height: "auto", marginBottom: 20, filter: `drop-shadow(0 0 28px ${C.accent}66)`, display: "block" }} />
      <div style={{ fontSize: 24, fontWeight: 800, color: C.accent, marginBottom: 6, letterSpacing: "0.05em" }}>
        PATROL<span style={{ color: C.textDim }}>TRACK</span>
      </div>
      <div style={{ fontSize: 15, color: C.textDim, marginBottom: 32, textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
        {wasActive
          ? "Toca per reactivar el radar i les alertes sonores."
          : "Activa el radar GPS i rebràs alertes quan t'acostis a una zona de risc."}
      </div>
      <button onClick={onActivate} autoFocus style={{ width: "100%", maxWidth: 340, padding: "20px 24px", background: C.success, color: "#fff", border: "none", borderRadius: 12, fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 0 32px ${C.success}66` }}>
        ▶ ACTIVAR PROTECCIÓ
      </button>
      <button onClick={onSkip} style={{ marginTop: 18, background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
        Saltar (sense alertes automàtiques)
      </button>
      <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", fontSize: 11, color: C.textMuted, padding: "0 24px" }}>
        Requereix permís d'ubicació i so del dispositiu
      </div>
    </div>
  );
}
