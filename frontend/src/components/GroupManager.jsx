import { useCallback, useEffect, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";

// Gestió dels grups de WhatsApp i Telegram que alimenten l'app.
// Els grups APAREIXEN SOLS: quan el mòbil d'algú (MacroDroid) en rep la primera
// notificació, surten a "Nous" i només cal triar Seguir o Ignorar. Ja no s'escriuen
// noms a mà ni s'afegeix cap bot (molts grups de Telegram no deixen entrar bots).
// Cos de la petició de MacroDroid: el text màgic va entre {claus}.
const macroBody = (source) => `{"message":"{notification}","group_name":"{not_title}","source":"${source}"}`;
const NICK_KEY = "pt_nick";

const SourceBadge = ({ source }) => {
  const wa = source === "whatsapp";
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 4, letterSpacing: "0.04em", background: wa ? "#25d36622" : "#2aabee22", color: wa ? "#25d366" : "#2aabee", border: `1px solid ${wa ? "#25d36655" : "#2aabee55"}` }}>
      {wa ? "WHATSAPP" : "TELEGRAM"}
    </span>
  );
};

function Toggle({ on, onChange, C, disabled }) {
  return (
    <button onClick={onChange} disabled={disabled} aria-pressed={on}
      style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: disabled ? "wait" : "pointer", position: "relative", flexShrink: 0, background: on ? C.success : C.border, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

export default function GroupManager({ apiToken }) {
  const C = useC();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [nick] = useState(() => { try { return localStorage.getItem(NICK_KEY) || ""; } catch { return ""; } });
  const [copied, setCopied] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const call = useCallback(async (path, body) => {
    const r = await fetch(`${API}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "x-ingest-token": apiToken, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.reason || `Error ${r.status}`);
    return d;
  }, [apiToken]);

  const load = useCallback(() => {
    if (!apiToken) return Promise.resolve();
    return call("/api/group-settings")
      .then((d) => { setGroups(d.groups || []); setError(null); })
      .catch((e) => setError(e.message));
  }, [apiToken, call]);

  useEffect(() => {
    let alive = true;
    if (apiToken) {
      call("/api/group-settings")
        .then((d) => { if (alive) { setGroups(d.groups || []); setError(null); } })
        .catch((e) => { if (alive) setError(e.message); });
    }
    return () => { alive = false; };
  }, [apiToken, call]);

  const setStatus = async (g, status) => {
    setBusy(`${g.source}|${g.name}`);
    try {
      await call("/api/group-settings", { source: g.source, name: g.name, status, added_by: nick || undefined });
      await load();
    } catch (e) { setError(e.message); }
    setBusy(null);
  };

  const remove = async (g) => {
    if (!confirm(`Treure "${g.name}" de la llista?\n\nLes deteccions ja desades es queden. Si torna a arribar algun missatge, sortirà com a grup nou.`)) return;
    setBusy(`${g.source}|${g.name}`);
    try { await call("/api/group-settings/delete", { source: g.source, name: g.name }); await load(); } catch (e) { setError(e.message); }
    setBusy(null);
  };

  const copyBody = (source) => {
    navigator.clipboard?.writeText(macroBody(source)).then(() => { setCopied(source); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };

  const btn = (bg, fg) => ({ background: bg, color: fg, border: "none", borderRadius: 7, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 });

  if (!apiToken) {
    return (
      <div style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, fontSize: 13, color: C.textDim }}>
        Configura primer el token (més amunt) per veure i gestionar els grups.
      </div>
    );
  }

  // Els nous, primer els que porten més missatges (els xats privats solen quedar a baix)
  const pending = (groups || []).filter((g) => g.status === "pending").sort((a, b) => (b.hits || 0) - (a.hits || 0));
  const rest = (groups || []).filter((g) => g.status !== "pending");

  return (
    <div style={{ textAlign: "left" }}>
      <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.5, marginBottom: 12 }}>
        Els grups <b style={{ color: C.text }}>apareixen sols</b> quan el teu mòbil (MacroDroid) en rep la primera notificació.
        Toca <b style={{ color: C.success }}>Seguir</b> als grups d'avisos i <b>Ignorar</b> als xats privats o grups que no en són: d'aquests no es desa res.
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>⚠ {error}</div>}
      {groups === null && !error && <div style={{ fontSize: 13, color: C.textDim }}>Carregant grups…</div>}

      {/* Grups nous pendents */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.warning, marginBottom: 6 }}>🆕 Nous ({pending.length}): tria si els segueixes</div>
          {pending.map((g) => (
            <div key={`${g.source}|${g.name}`} style={{ background: C.bg, border: `1px solid ${C.warning}66`, borderLeft: `3px solid ${C.warning}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, fontSize: 11, color: C.textDim }}>
                  <SourceBadge source={g.source} /> {g.hits} missatge{g.hits === 1 ? "" : "s"} rebut{g.hits === 1 ? "" : "s"}
                </div>
              </div>
              <button onClick={() => setStatus(g, "active")} disabled={!!busy} style={btn(C.success, C.bg)}>✅ Seguir</button>
              <button onClick={() => setStatus(g, "off")} disabled={!!busy} style={btn("transparent", C.textDim)}>🚫 Ignorar</button>
            </div>
          ))}
        </div>
      )}

      {/* Grups actius / desactivats */}
      {rest.map((g) => {
        const on = g.status === "active";
        const key = `${g.source}|${g.name}`;
        const when = g.last_seen ? new Date(g.last_seen).toLocaleDateString("ca-ES", { day: "2-digit", month: "2-digit" }) : "—";
        return (
          <div key={key} style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${on ? C.success : C.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8, opacity: on ? 1 : 0.65 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, fontSize: 11, color: C.textDim, flexWrap: "wrap" }}>
                <SourceBadge source={g.source} />
                <span><b style={{ color: C.accent }}>{g.detections}</b> avisos · últim {when}</span>
                {g.added_by && <span>· per {g.added_by}</span>}
              </div>
            </div>
            <Toggle on={on} C={C} disabled={busy === key} onChange={() => setStatus(g, on ? "off" : "active")} />
            <button onClick={() => remove(g)} disabled={!!busy} aria-label="Treure" style={{ background: "none", border: "none", color: C.textMuted, fontSize: 15, cursor: "pointer", padding: 2 }}>🗑</button>
          </div>
        );
      })}
      {groups && groups.length === 0 && (
        <div style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, fontSize: 13, color: C.textDim, textAlign: "center" }}>Encara no ha arribat cap notificació. Configura MacroDroid (guia a sota) i els grups sortiran aquí.</div>
      )}

      {/* Guia (per a tu i per als amics) */}
      <button onClick={() => setShowHelp(!showHelp)} style={{ ...btn("transparent", C.accent), padding: "8px 0", marginTop: 4 }}>
        {showHelp ? "▾" : "▸"} Guia: com connectar els grups d'un mòbil (MacroDroid)
      </button>
      {showHelp && (
        <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
          <div style={{ marginBottom: 6, color: C.text }}>Sense això l'app funciona igual (es veuen tots els avisos), però els missatges dels <b>teus</b> grups no hi entren.</div>
          <div><b>1.</b> Obre l'<b>enllaç personal</b> que t'ha passat l'administrador (Config → 🤝 Amics). L'app queda amb el teu accés.</div>
          <div><b>2.</b> Instal·la <b>MacroDroid</b> i dona-li <b>accés a les notificacions</b>. Al mòbil, permet-li l'activitat en segon pla (Ajustos → Aplicacions → MacroDroid → Bateria).</div>
          <div><b>3.</b> Crea una macro per a <b>WhatsApp</b>: disparador <i>Notificació rebuda → WhatsApp</i>; acció <i>Petició HTTP</i>, mètode <b>POST</b>, URL</div>
          <code style={{ display: "block", fontSize: 11, color: C.text, wordBreak: "break-all", margin: "3px 0" }}>{API || window.location.origin}/api/ingest</code>
          <div>capçalera <code style={{ color: C.text }}>x-ingest-token</code> = el teu token (Config → Assistent → pas 1 → Copiar), tipus <code style={{ color: C.text }}>application/json</code> i aquest cos:</div>
          {["whatsapp", "telegram"].map((src) => (
            <div key={src} style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0" }}>
              <code style={{ flex: 1, fontSize: 10.5, color: C.text, background: C.surface, padding: 6, borderRadius: 6, wordBreak: "break-all" }}>{macroBody(src)}</code>
              <button onClick={() => copyBody(src)} style={btn(C.accent, C.bg)}>{copied === src ? "✓" : (src === "whatsapp" ? "WhatsApp" : "Telegram")}</button>
            </div>
          ))}
          <div><b>4.</b> Clona la macro per a <b>Telegram</b> (o Plus Messenger) i fes servir el segon cos (acaba en <code style={{ color: C.text }}>"telegram"</code>).</div>
          <div><b>5.</b> Quan arribi el primer missatge d'un grup, sortirà aquí a <b>🆕 Nous</b>: toca <b>Seguir</b>. Els grups <b>no poden estar silenciats</b>.</div>
          <div style={{ marginTop: 8 }}><b>Sense MacroDroid:</b> mantén premut un avís a WhatsApp o Telegram → <b>Compartir</b> → <b>PatrolTrack</b> → Enviar (cal tenir l'app a la pantalla d'inici).</div>
        </div>
      )}
    </div>
  );
}
