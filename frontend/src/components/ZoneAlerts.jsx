import { useEffect, useState } from "react";
import { useC } from "../lib/themes";
import { API, MAP_ZONES } from "../lib/constants";

// "Avisos de controls per Telegram": tries zones i el bot de PatrolTrack t'escriu quan
// algú avisa d'un control en una d'aquestes zones (i quan diuen que ja han marxat).
// Gratis. La primera vegada cal obrir el bot i tocar INICIAR (enllaça el xat amb tu).
export default function ZoneAlerts({ apiToken, extraZones = [] }) {
  const C = useC();
  const [state, setState] = useState(null); // {zones, telegram_linked, bot_url}
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = () => {
    if (!apiToken) return;
    fetch(`${API}/api/zone-subs`, { headers: { "x-ingest-token": apiToken }, cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (d.ok) setState(d); else setError(d.reason || "error"); })
      .catch(() => setError("No s'ha pogut connectar"));
  };
  useEffect(load, [apiToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!apiToken) return <div style={{ fontSize: 13, color: C.textDim }}>Primer obre l'app amb el teu enllaç personal.</div>;
  if (!state) return <div style={{ fontSize: 13, color: error ? C.danger : C.textDim }}>{error ? `⚠ ${error}` : "Carregant…"}</div>;

  const all = [...new Set([...MAP_ZONES.map((z) => z.id), ...extraZones, ...state.zones])]
    .filter((z) => z && z !== "Desconeguda").sort((a, b) => a.localeCompare(b, "ca"));
  const toggle = async (zone) => {
    const zones = state.zones.includes(zone) ? state.zones.filter((z) => z !== zone) : [...state.zones, zone];
    setState({ ...state, zones });
    setSaving(true); setError(null);
    try {
      const r = await fetch(`${API}/api/zone-subs`, {
        method: "POST", headers: { "content-type": "application/json", "x-ingest-token": apiToken },
        body: JSON.stringify({ zones }),
      });
      const d = await r.json();
      if (!d.ok) setError(d.reason || "No s'ha pogut desar");
    } catch { setError("No s'ha pogut desar"); }
    setSaving(false);
  };
  const chip = (on) => ({ padding: "7px 10px", borderRadius: 8, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentDim : "transparent", color: on ? C.accent : C.textDim, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div style={{ display: "grid", gap: 10, textAlign: "left" }}>
      <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.5 }}>
        El bot de PatrolTrack t'escriu a <b>Telegram</b> quan algú avisa d'un control a les zones que triïs, encara que tinguis l'app tancada. És gratis.
      </div>
      {state.telegram_linked ? (
        <div style={{ fontSize: 13, color: C.success, fontWeight: 700 }}>✓ Telegram enllaçat</div>
      ) : state.bot_url ? (
        <a href={state.bot_url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(load, 15000)}
          style={{ display: "block", textAlign: "center", background: "#229ED9", color: "#fff", borderRadius: 8, padding: "10px 12px", fontWeight: 800, fontSize: 13.5, textDecoration: "none" }}>
          📲 1. Enllaça Telegram (toca INICIAR al bot)
        </a>
      ) : (
        <div style={{ fontSize: 12.5, color: C.warning }}>El bot de Telegram no està configurat al servidor.</div>
      )}
      <div style={{ fontSize: 12, color: C.textMuted }}>{state.telegram_linked ? "Zones que segueixes:" : "2. Tria les zones:"} {saving ? "desant…" : ""}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {all.map((z) => <button key={z} onClick={() => toggle(z)} style={chip(state.zones.includes(z))}>{state.zones.includes(z) ? "🔔 " : ""}{z}</button>)}
      </div>
      {error && <div style={{ fontSize: 12, color: C.danger }}>⚠ {error}</div>}
      {!state.telegram_linked && state.bot_url && (
        <button onClick={load} style={{ background: "none", border: "none", color: C.accent, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>Ja he tocat INICIAR → comprovar</button>
      )}
    </div>
  );
}
