import { useCallback, useEffect, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";

// Gestió dels grups de WhatsApp i Telegram que alimenten l'app.
// Els grups APAREIXEN SOLS: quan el mòbil d'algú (MacroDroid) en rep la primera
// notificació, surten a "Nous" i només cal triar Seguir o Ignorar. Ja no s'escriuen
// noms a mà ni s'afegeix cap bot (molts grups de Telegram no deixen entrar bots).

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
        Apareixen sols quan MacroDroid en rep el primer missatge. <b style={{ color: C.success }}>Seguir</b>: els seus avisos entren a l'app. <b>Ignorar</b>: no se'n desa res.
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
        <div style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, fontSize: 13, color: C.textDim, textAlign: "center" }}>Encara no ha arribat cap missatge. Fes els passos de «Connecta els teus grups» i els grups sortiran aquí.</div>
      )}

    </div>
  );
}
