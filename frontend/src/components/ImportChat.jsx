import { useEffect, useRef, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";
import { readChatFile, parseChat, groupFromFileName } from "../lib/chatImport";

// PROVA TEMPORAL — "Importar xats i captures":
//  · Xat exportat de WhatsApp (.txt / .zip): omple l'històric amb data i hora reals.
//  · Captura de pantalla a l'iPhone (doble toc al darrere → drecera): envia el que es veu.
// Tot va marcat (import / captura) i l'admin ho pot esborrar d'un cop des d'aquí.
// Per treure-ho: esborrar aquest fitxer, lib/chatImport.js i les línies d'App.jsx.
const CHUNK = 80;
const BULK_URL = `${API}/api/ingest-bulk`;

export default function ImportChat({ apiToken, admin }) {
  const C = useC();
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null);   // {group, messages}
  const [progress, setProgress] = useState(null); // {done, total}
  const [result, setResult] = useState(null);   // {ok, text}
  const [status, setStatus] = useState(null);   // {import, captura}
  const [paste, setPaste] = useState("");
  const [pasteRes, setPasteRes] = useState(null);
  const [copied, setCopied] = useState("");
  const [showSteps, setShowSteps] = useState(false);

  const post = async (body) => {
    const r = await fetch(BULK_URL, { method: "POST", headers: { "content-type": "application/json", "x-ingest-token": apiToken }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) throw new Error(d?.reason || `error ${r.status}`);
    return d;
  };
  const loadStatus = () => { if (apiToken) post({ mode: "status" }).then(setStatus).catch(() => {}); };
  useEffect(loadStatus, [apiToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!apiToken) return <div style={{ fontSize: 13, color: C.textDim }}>Primer obre l'app amb el teu enllaç personal.</div>;

  const box = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "grid", gap: 8 };
  const h = { fontSize: 14, fontWeight: 800, color: C.text };
  const p = { fontSize: 12.5, color: C.textDim, lineHeight: 1.5 };
  const btn = (bg, fg) => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "10px 12px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center" });
  const mini = { background: C.surface, color: C.accent, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const code = { background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 5px", fontSize: 11.5, wordBreak: "break-all" };
  const copy = (txt, id) => navigator.clipboard?.writeText(txt).then(() => { setCopied(id); setTimeout(() => setCopied(""), 1500); }).catch(() => {});

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setResult(null); setParsed(null);
    try {
      const messages = parseChat(await readChatFile(f));
      if (!messages.length) { setResult({ ok: false, text: "No hi he trobat missatges dels últims 6 mesos. És un xat exportat de WhatsApp?" }); return; }
      setParsed({ group: groupFromFileName(f.name), messages });
    } catch (err) {
      setResult({ ok: false, text: err.message || "No s'ha pogut llegir el fitxer" });
    }
  };

  const send = async () => {
    const { group, messages } = parsed;
    const total = Math.ceil(messages.length / CHUNK);
    const sum = { stored: 0, followups: 0, duplicates: 0 };
    let capped = false;
    setResult(null);
    for (let i = 0; i < total; i++) {
      setProgress({ done: i, total });
      try {
        const d = await post({ mode: "history", group_name: group, messages: messages.slice(i * CHUNK, (i + 1) * CHUNK) });
        sum.stored += d.stored; sum.followups += d.followups; sum.duplicates += d.duplicates;
        capped = capped || d.capped;
      } catch (err) {
        setProgress(null);
        setResult({ ok: false, text: `S'ha aturat a la part ${i + 1} de ${total} (${err.message}). Torna-ho a provar: el que ja hi és no es repeteix.` });
        loadStatus();
        return;
      }
    }
    setProgress(null); setParsed(null);
    setResult({ ok: true, text: `✓ Fet: ${sum.stored} avisos nous i ${sum.followups} seguiments (quan s'han anat). ${sum.duplicates} ja hi eren.${capped ? " ⚠ S'ha arribat al límit d'avisos del model: no s'ha desat tot." : ""}` });
    loadStatus();
  };

  const sendPaste = async () => {
    setPasteRes(null);
    try { const d = await post({ mode: "screenshot", text: paste }); setPasteRes({ ok: true, text: d.summary }); setPaste(""); loadStatus(); }
    catch (err) { setPasteRes({ ok: false, text: err.message }); }
  };

  const undo = async () => {
    if (!window.confirm("Esborrar TOTS els avisos que han entrat per xats importats i captures? La resta no es toca.")) return;
    try { setStatus(await post({ mode: "undo" })); setResult({ ok: true, text: "✓ Esborrat. Tot torna a estar com abans de la prova." }); }
    catch (err) { setResult({ ok: false, text: err.message }); }
  };

  const copyBtn = (txt, id, label) => <button onClick={() => copy(txt, id)} style={mini}>{copied === id ? "✓ copiat" : label}</button>;

  return (
    <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
      <div style={{ ...p, fontSize: 12 }}>🧪 <b>En prova.</b> Tot el que entra per aquí queda marcat i es pot esborrar d'un cop.</div>

      {/* 1. Xat exportat */}
      <div style={box}>
        <div style={h}>📚 Omplir l'històric amb un xat</div>
        <div style={p}>
          WhatsApp → obre el grup → toca el <b>nom del grup</b> a dalt → <b>Exportar xat</b> → <b>Sense fitxers</b> → desa'l (a l'iPhone: <i>Desar a Fitxers</i>). Després tria'l aquí.
          Entren els avisos dels últims 6 mesos amb el seu dia i hora: el % de cada zona millora de cop.
        </div>
        <input ref={fileRef} type="file" accept=".txt,.zip,text/plain,application/zip" onChange={onFile} style={{ display: "none" }} />
        {!parsed && !progress && <button onClick={() => fileRef.current?.click()} style={btn(C.accent, "#fff")}>📄 Triar el xat exportat (.zip o .txt)</button>}
        {parsed && !progress && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={p}>📄 <b>{parsed.messages.length}</b> missatges dels últims 6 mesos. Nom del grup:</div>
            <input value={parsed.group} onChange={(e) => setParsed({ ...parsed, group: e.target.value })}
              style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={send} style={{ ...btn(C.success, "#fff"), flex: 1 }}>⬆ Importar</button>
              <button onClick={() => setParsed(null)} style={{ ...btn("transparent", C.textDim), border: `1px solid ${C.border}` }}>Cancel·lar</button>
            </div>
          </div>
        )}
        {progress && (
          <div>
            <div style={p}>Enviant… {progress.done}/{progress.total}</div>
            <div style={{ height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
              <div style={{ width: `${(progress.done / progress.total) * 100}%`, height: "100%", background: C.accent, transition: "width .3s" }} />
            </div>
          </div>
        )}
        {result && <div style={{ fontSize: 13, color: result.ok ? C.success : C.danger, lineHeight: 1.45 }}>{result.text}</div>}
      </div>

      {/* 2. Captura de pantalla a l'iPhone */}
      <div style={box}>
        <div style={h}>📸 Captura de pantalla (iPhone)</div>
        <div style={p}>
          Mentre mires un grup, <b>dos copets a la part de darrere de l'iPhone</b>: l'iPhone llegeix la pantalla i envia tots els missatges que s'hi veuen, amb la seva hora. Gratis i sense instal·lar res.
        </div>
        <button onClick={() => setShowSteps(!showSteps)} style={{ ...mini, justifySelf: "start", padding: "6px 10px" }}>{showSteps ? "▾ Amagar els passos" : "▸ Com es prepara (5 min, un sol cop)"}</button>
        {showSteps && (
          <ol style={{ ...p, margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>App <b>Dreceres</b> → <b>+</b> → afegeix <b>Fer captura de pantalla</b> <span style={{ color: C.textMuted }}>(Hacer captura de pantalla)</span>.</li>
            <li>Afegeix <b>Extreure el text de la imatge</b> <span style={{ color: C.textMuted }}>(Extraer texto de imagen)</span> → de la <i>Captura de pantalla</i>.</li>
            <li>
              Afegeix <b>Obtenir el contingut de l'URL</b> <span style={{ color: C.textMuted }}>(Obtener contenido de URL)</span>:
              <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                <div>URL: <code style={code}>{BULK_URL}</code> {copyBtn(BULK_URL, "url", "copiar")}</div>
                <div>Mètode: <b>POST</b></div>
                <div>Capçalera: <b>x-ingest-token</b> = la teva clau {copyBtn(apiToken, "key", "copiar clau")}</div>
                <div>Cos: <b>JSON</b> amb dos camps de text:<br />· <b>mode</b> = <code style={code}>screenshot</code><br />· <b>text</b> = <i>Text</i> (el del pas 2)</div>
              </div>
            </li>
            <li><i>(Opcional)</i> <b>Obtenir el valor del diccionari</b> → clau <code style={code}>summary</code>, i <b>Mostrar la notificació</b> amb aquest valor: et dirà quants avisos ha trobat.</li>
            <li><b>Ajustos</b> → <b>Accessibilitat</b> → <b>Tocar</b> → <b>Tocar part posterior</b> → <b>Doble toc</b> → tria la drecera.</li>
          </ol>
        )}
        <div style={{ ...p, fontSize: 12 }}>Prova-ho aquí: enganxa text copiat d'un xat (amb les hores) i envia'l com si fos una captura.</div>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={"~ Joan\nControl a la rotonda de Sort 10:21"}
          style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
        <button onClick={sendPaste} disabled={!paste.trim()} style={{ ...btn(paste.trim() ? C.accent : C.border, "#fff"), opacity: paste.trim() ? 1 : 0.6 }}>Enviar com a captura</button>
        {pasteRes && <div style={{ fontSize: 13, color: pasteRes.ok ? C.success : C.danger }}>{pasteRes.ok ? "✓ " : "⚠ "}{pasteRes.text}</div>}
      </div>

      {status && (
        <div style={{ ...p, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>A la base de dades: <b>{status.import}</b> avisos de xats importats · <b>{status.captura}</b> de captures</span>
          {admin && (status.import > 0 || status.captura > 0) && (
            <button onClick={undo} style={{ ...mini, color: C.danger }}>🗑 Esborrar tot l'importat</button>
          )}
        </div>
      )}
    </div>
  );
}
