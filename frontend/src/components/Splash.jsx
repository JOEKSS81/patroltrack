import { useC } from "../lib/themes";

// Splash d'auto-activació del Radar GPS. Apareix a l'arrencar l'app.
// Layout en flux normal (sense `position:absolute` per al footer) perquè el
// text inferior no es solapi amb els botons en pantalles curtes (P40 Lite, etc.).
export default function Splash({ onActivate, onSkip, wasActive, dogPhoto }) {
  const C = useC();
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: C.bg, color: C.text,
        display: "flex", flexDirection: "column", alignItems: "center",
        // `safe-area-inset-bottom` cobreix la barra dinàmica del navegador mòbil
        padding: "max(16px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom)) 20px",
        fontFamily: "'DM Mono','Courier New',monospace",
        overflowY: "auto",
        gap: 14,
      }}
    >
      {/* Espaiador superior — empeny el contingut cap al centre, però es comprimeix si cal */}
      <div style={{ flex: "1 1 auto", minHeight: 8 }} />

      <img
        src={dogPhoto}
        alt="PatrolTrack"
        style={{
          maxWidth: "min(75vw, 320px)",
          maxHeight: "min(38vh, 280px)",
          width: "auto", height: "auto",
          filter: `drop-shadow(0 0 28px ${C.accent}66)`,
          display: "block",
          flexShrink: 0,
        }}
      />

      <div style={{ fontSize: 24, fontWeight: 800, color: C.accent, letterSpacing: "0.05em", lineHeight: 1 }}>
        PATROL<span style={{ color: C.textDim }}>TRACK</span>
      </div>

      <div
        style={{
          fontSize: 14, color: C.textDim,
          textAlign: "center", maxWidth: 320, lineHeight: 1.45,
          paddingInline: 4,
        }}
      >
        {wasActive
          ? "Toca per reactivar el radar i les alertes sonores."
          : "Activa el radar GPS i rebràs alertes quan t'acostis a una zona de risc."}
      </div>

      <button
        onClick={onActivate}
        autoFocus
        style={{
          width: "100%", maxWidth: 340,
          padding: "18px 24px",
          background: C.success, color: "#fff",
          border: "none", borderRadius: 12,
          fontSize: 17, fontWeight: 800, cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: `0 0 32px ${C.success}66`,
          flexShrink: 0,
        }}
      >
        ▶ ACTIVAR PROTECCIÓ
      </button>

      <button
        onClick={onSkip}
        style={{
          background: "none", border: "none", color: C.textMuted,
          fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          textDecoration: "underline",
          padding: "4px 8px",
        }}
      >
        Saltar (sense alertes automàtiques)
      </button>

      {/* Espaiador inferior — fa baixar el peu fins al fons, sense overlap */}
      <div style={{ flex: "1 1 auto", minHeight: 8 }} />

      <div
        style={{
          fontSize: 11, color: C.textMuted,
          textAlign: "center", padding: "0 8px",
          flexShrink: 0,
        }}
      >
        Requereix permís d'ubicació i so del dispositiu
      </div>
    </div>
  );
}
