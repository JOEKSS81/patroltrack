import { useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";
import Collapsible from "./Collapsible";

// "La meva clau": la clau personal que porta la macro de MacroDroid i que fa servir
// l'app per parlar amb el servidor. Es pot copiar, comprovar i (en un mòbil nou)
// enganxar. Ja no es pot "generar" una clau nova des d'aquí: deixaria l'app sense accés.
export default function MyKey({ apiToken, setApiToken }) {
  const C = useC();
  const [copied, setCopied] = useState(false);
  const [check, setCheck] = useState(null); // null | "checking" | {ok, text}
  const [editing, setEditing] = useState(!apiToken);
  const [draft, setDraft] = useState("");

  const masked = apiToken ? `${"•".repeat(10)}${apiToken.slice(-4)}` : "—";
  const btn = (bg, fg, extra) => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...extra });

  const copy = () => {
    navigator.clipboard?.writeText(apiToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const verify = async (token = apiToken) => {
    setCheck("checking");
    try {
      const r = await fetch(`${API}/api/me`, { headers: { "x-ingest-token": token } });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.ok) setCheck({ ok: true, text: `✓ Clau vàlida · ${d.admin ? "administrador" : d.name || "amic"}` });
      else setCheck({ ok: false, text: "✗ El servidor no reconeix aquesta clau. Demana un enllaç nou a qui t'ha passat l'app." });
    } catch {
      setCheck({ ok: false, text: "✗ No s'ha pogut connectar amb el servidor." });
    }
  };
  const save = () => {
    const t = draft.trim();
    if (!t) return;
    setApiToken(t); setDraft(""); setEditing(false); verify(t);
  };

  return (
    <Collapsible title="🔑 La meva clau" subtitle={apiToken ? `Acaba en …${apiToken.slice(-4)} · no la comparteixis` : "Sense clau en aquest mòbil"} defaultOpen={false}>
      <div style={{ display: "grid", gap: 8, textAlign: "left" }}>
        <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.5 }}>
          És la teva contrasenya amb el servidor. La porta la macro de MacroDroid i l'app la fa servir per desar avisos.
        </div>
        {apiToken && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <code style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.text, background: C.bg, padding: 8, borderRadius: 6, border: `1px solid ${C.border}` }}>{masked}</code>
            <button onClick={copy} style={btn(C.accent, C.bg)}>{copied ? "✓" : "Copiar"}</button>
            <button onClick={() => verify()} style={btn("transparent", C.text, { border: `1px solid ${C.border}` })}>Comprovar</button>
          </div>
        )}
        {check === "checking" && <div style={{ fontSize: 12.5, color: C.textDim }}>Comprovant…</div>}
        {check && check !== "checking" && <div style={{ fontSize: 12.5, color: check.ok ? C.success : C.danger, lineHeight: 1.5 }}>{check.text}</div>}
        {editing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Enganxa aquí la clau" autoComplete="off"
              style={{ flex: 1, minWidth: 0, padding: "8px 10px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13 }} />
            <button onClick={save} disabled={!draft.trim()} style={btn(C.accent, C.bg, { opacity: draft.trim() ? 1 : 0.5 })}>Desar</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>
            Posar una altra clau (p. ex. en un mòbil nou)
          </button>
        )}
      </div>
    </Collapsible>
  );
}
