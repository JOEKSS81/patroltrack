import { useState } from "react";
import { useC } from "../lib/themes";

// Secció plegable per a la pestanya Config — fa la pantalla molt més àgil:
// cada bloc es pot tancar perquè només quedi visible el que t'interessa.
// `right` permet posar botons d'acció a la capçalera (no propaguen el toggle).
export default function Collapsible({ title, subtitle, defaultOpen = false, right = null, children }) {
  const C = useC();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${open ? C.border : `${C.border}99`}`, marginBottom: 12, overflow: "hidden", transition: "border-color .2s" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>{title}</div>
          {subtitle && !open && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {right}
          <span
            onClick={() => setOpen((o) => !o)}
            style={{ fontSize: 20, lineHeight: 1, color: C.textDim, cursor: "pointer", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s", display: "inline-block" }}
          >›</span>
        </div>
      </div>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}
