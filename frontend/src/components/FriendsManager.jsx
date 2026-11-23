import { useCallback, useEffect, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";

// Accessos per amic (només l'administrador). Cada amic rep un enllaç amb el seu token:
// en obrir-lo, l'app queda configurada i ja pot afegir els seus propis grups.
export default function FriendsManager({ apiToken }) {
  const C = useC();
  const [users, setUsers] = useState(null);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState(null); // {name, link}
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const load = useCallback(() => call("/api/users").then((d) => setUsers(d.users || [])).catch((e) => setError(e.message)), [call]);

  useEffect(() => {
    let alive = true;
    call("/api/users").then((d) => { if (alive) setUsers(d.users || []); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [call]);

  const create = async () => {
    if (name.trim().length < 2) return;
    setBusy(true); setError(null); setCopied(false);
    try {
      const d = await call("/api/users", { name: name.trim() });
      setInvite({ name: d.name, link: `${window.location.origin}/#invite=${d.token}` });
      setName("");
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const share = async () => {
    if (!invite) return;
    const text = `Hola ${invite.name}! Aquest és el teu accés a PatrolTrack (avisos de controls):\n${invite.link}\n\n1) Obre l'enllaç des del mòbil i afegeix l'app a la pantalla d'inici.\n2) Perquè els avisos dels teus grups de WhatsApp i Telegram també hi entrin, ves a Config → «Connecta els teus grups» i segueix els 4 passos (Android: MacroDroid · iPhone: una drecera de l'app Dreceres).\nAquest enllaç és només per a tu.`;
    try {
      if (navigator.share) await navigator.share({ title: "PatrolTrack", text });
      else { await navigator.clipboard.writeText(text); setCopied(true); }
    } catch { /* cancel·lat */ }
  };

  const copy = () => {
    navigator.clipboard?.writeText(invite.link).then(() => setCopied(true)).catch(() => {});
  };

  const revoke = async (u) => {
    if (!confirm(`Treure l'accés a ${u.name}?\n\nEl seu enllaç i el seu token deixaran de funcionar. Les deteccions que ja ha aportat es queden.`)) return;
    try { await call("/api/users/revoke", { id: u.id }); await load(); } catch (e) { setError(e.message); }
  };

  const input = { flex: 1, minWidth: 0, padding: "9px 10px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none" };
  const btn = (bg, fg) => ({ background: bg, color: fg, border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 });

  return (
    <div style={{ textAlign: "left" }}>
      <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5, marginBottom: 10 }}>
        Crea un accés per a cada amic i envia-li. Amb l'enllaç, la seva app queda configurada; després només li cal fer els passos de «Connecta els teus grups».
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Nom de l'amic" style={input} />
        <button onClick={create} disabled={busy || name.trim().length < 2} style={{ ...btn(C.accent, C.bg), opacity: name.trim().length < 2 ? 0.5 : 1 }}>{busy ? "…" : "Crear accés"}</button>
      </div>

      {invite && (
        <div style={{ background: C.bg, border: `1px solid ${C.success}`, borderRadius: 10, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.success, marginBottom: 6 }}>✓ Accés creat per a {invite.name}</div>
          <code style={{ display: "block", fontSize: 10.5, color: C.text, background: C.surface, padding: 6, borderRadius: 6, wordBreak: "break-all", marginBottom: 8 }}>{invite.link}</code>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={share} style={{ ...btn(C.accent, C.bg), flex: 1 }}>📤 Enviar a {invite.name}</button>
            <button onClick={copy} style={btn("transparent", C.accent)}>{copied ? "✓ Copiat" : "Copiar"}</button>
          </div>
          <div style={{ fontSize: 11, color: C.warning, marginTop: 8, lineHeight: 1.4 }}>
            ⚠ Envia-li només a ell: qui tingui aquest enllaç entra com a {invite.name}. No el podràs tornar a veure; si es perd, crea'n un de nou.
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>⚠ {error}</div>}

      {users && users.length === 0 && <div style={{ fontSize: 12, color: C.textMuted }}>Encara no has creat cap accés.</div>}
      {(users || []).map((u) => {
        const seen = u.last_seen ? new Date(u.last_seen).toLocaleDateString("ca-ES", { day: "2-digit", month: "2-digit" }) : "mai";
        return (
          <div key={u.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${u.revoked ? C.border : C.success}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8, opacity: u.revoked ? 0.5 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{u.name}{u.revoked ? " · sense accés" : ""}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{u.groups} grup{u.groups === 1 ? "" : "s"} actiu{u.groups === 1 ? "" : "s"} · última connexió {seen}</div>
            </div>
            {!u.revoked && <button onClick={() => revoke(u)} style={btn("transparent", C.danger)}>Treure</button>}
          </div>
        );
      })}
    </div>
  );
}
