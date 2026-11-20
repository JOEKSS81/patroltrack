import { useCallback, useEffect, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";

// Gestió dels grups de WhatsApp i Telegram que alimenten l'app.
// Cada persona (tu o un amic amb el token) pot afegir, activar o desactivar els seus grups.
//  - WhatsApp: els grups nous que arriben de MacroDroid surten com a "Nous" fins que algú els activa.
//  - Telegram: afegir el bot al grup ja l'activa; aquí es pot desactivar.
const MACRODROID_BODY = '{"message":"[notification]","group_name":"[notification_title]","source":"whatsapp"}';
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
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("whatsapp");
  const [nick, setNick] = useState(() => { try { return localStorage.getItem(NICK_KEY) || ""; } catch { return ""; } });
  const [copied, setCopied] = useState(false);
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

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try { localStorage.setItem(NICK_KEY, nick); } catch { /* */ }
    setBusy("add");
    try {
      await call("/api/group-settings", { source: newSource, name, status: "active", added_by: nick || undefined });
      setNewName("");
      await load();
    } catch (e) { setError(e.message); }
    setBusy(null);
  };

  const copyBody = () => {
    navigator.clipboard?.writeText(MACRODROID_BODY).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const input = { flex: 1, minWidth: 0, padding: "9px 10px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none" };
  const btn = (bg, fg) => ({ background: bg, color: fg, border: "none", borderRadius: 7, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 });

  if (!apiToken) {
    return (
      <div style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, fontSize: 13, color: C.textDim }}>
        Configura primer el token (més amunt) per veure i gestionar els grups.
      </div>
    );
  }

  const pending = (groups || []).filter((g) => g.status === "pending");
  const rest = (groups || []).filter((g) => g.status !== "pending");

  return (
    <div style={{ textAlign: "left" }}>
      {/* Afegir grup */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>➕ Afegir un grup</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {[["whatsapp", "WhatsApp"], ["telegram", "Telegram"]].map(([k, l]) => (
            <button key={k} onClick={() => setNewSource(k)} style={{ flex: 1, padding: "7px", borderRadius: 7, border: `1px solid ${newSource === k ? C.accent : C.border}`, background: newSource === k ? C.accentDim : "transparent", color: newSource === k ? C.accent : C.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nom exacte del grup" style={input} />
          <button onClick={add} disabled={!newName.trim() || busy === "add"} style={{ ...btn(C.accent, C.bg), opacity: newName.trim() ? 1 : 0.5 }}>{busy === "add" ? "…" : "Afegir"}</button>
        </div>
        <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="El teu nom (opcional, perquè se sàpiga qui l'ha afegit)" style={{ ...input, width: "100%", boxSizing: "border-box", fontSize: 12, padding: "7px 10px" }} />
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 1.4 }}>
          {newSource === "whatsapp"
            ? "Escriu-lo tal com surt a WhatsApp. També pots no escriure res: quan arribi el primer missatge, el grup sortirà a «Nous» i només caldrà activar-lo."
            : "Amb el bot: afegeix-lo al grup amb el botó de Telegram de més amunt i el grup sortirà aquí sol. Escriu el nom només si el llegeixes amb MacroDroid."}
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>⚠ {error}</div>}
      {groups === null && !error && <div style={{ fontSize: 13, color: C.textDim }}>Carregant grups…</div>}

      {/* Grups nous pendents */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.warning, marginBottom: 6 }}>🆕 Nous ({pending.length}): activa'ls perquè els seus avisos surtin a l'app</div>
          {pending.map((g) => (
            <div key={`${g.source}|${g.name}`} style={{ background: C.bg, border: `1px solid ${C.warning}66`, borderLeft: `3px solid ${C.warning}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, fontSize: 11, color: C.textDim }}>
                  <SourceBadge source={g.source} /> {g.hits} missatge{g.hits === 1 ? "" : "s"} rebut{g.hits === 1 ? "" : "s"}
                </div>
              </div>
              <button onClick={() => setStatus(g, "active")} disabled={!!busy} style={btn(C.success, C.bg)}>Activar</button>
              <button onClick={() => setStatus(g, "off")} disabled={!!busy} style={btn("transparent", C.textDim)}>Ignorar</button>
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
        <div style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, fontSize: 13, color: C.textDim, textAlign: "center" }}>Encara no hi ha cap grup. Afegeix-ne un a dalt.</div>
      )}

      {/* Ajuda per als amics */}
      <button onClick={() => setShowHelp(!showHelp)} style={{ ...btn("transparent", C.accent), padding: "8px 0", marginTop: 4 }}>
        {showHelp ? "▾" : "▸"} Com connecta un amic els seus grups de WhatsApp?
      </button>
      {showHelp && (
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.55, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
          <div>1. Obre PatrolTrack, ves a <b>Config</b> i enganxa el <b>token</b> (demana-te'l a qui t'ha passat l'app).</div>
          <div>2. Instal·la <b>MacroDroid</b> i dona-li accés a les notificacions.</div>
          <div>3. Crea una macro: <b>Disparador</b> Notificació rebuda → WhatsApp. <b>Acció</b> Petició HTTP POST a<br />
            <code style={{ fontSize: 11, color: C.text, wordBreak: "break-all" }}>{API || window.location.origin}/api/ingest</code><br />
            amb la capçalera <code style={{ color: C.text }}>x-ingest-token</code> = el token i aquest cos:</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0" }}>
            <code style={{ flex: 1, fontSize: 10.5, color: C.text, background: C.surface, padding: 6, borderRadius: 6, wordBreak: "break-all" }}>{MACRODROID_BODY}</code>
            <button onClick={copyBody} style={btn(C.accent, C.bg)}>{copied ? "✓" : "Copiar"}</button>
          </div>
          <div>4. Quan arribi el primer missatge d'un grup, sortirà aquí a <b>🆕 Nous</b>: toca <b>Activar</b>. Els xats privats o els grups que no vulguis, toca <b>Ignorar</b> i no se'n desarà res.</div>
          <div style={{ marginTop: 4 }}>El grup no pot estar silenciat: si WhatsApp no mostra la notificació, MacroDroid no la veu.</div>
        </div>
      )}
    </div>
  );
}
