import { useRef, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";

// PROVA TEMPORAL — botó «📷 Adjuntar captura» del + :
// tries una captura d'un xat, el mòbil en llegeix el text (tesseract.js, dins l'app:
// la imatge no surt del mòbil), el servidor diu quins avisos hi ha i, si vols, s'envien.
// Fa servir la mateixa ruta que les captures de l'iPhone (/api/ingest-bulk, "captura").

// Gris, invertida si la captura és en mode fosc, i en blanc i negre: així les hores
// (gris clar) no es perden i el lector llegeix lletra negra sobre fons blanc.
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 900 ? 2 : 1;
  const w = bmp.width * scale, h = bmp.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const dark = sum / (w * h) < 110;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = (dark ? 255 - g : g) < 175 ? 0 : 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

async function readImage(file, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["spa", "cat"], 1, {
    logger: (m) => { if (m.status === "recognizing text") onProgress(Math.round(m.progress * 100)); },
  });
  try {
    const { data } = await worker.recognize(await prepare(file));
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

const KIND = { alert: "🔴", cleared: "✅ Ja han marxat", still: "⏳ Segueixen", ask: "❓ Pregunten", yes: "Sí", no: "No" };

export default function ScreenshotReport({ apiToken }) {
  const C = useC();
  const fileRef = useRef(null);
  const [step, setStep] = useState(null); // null | {reading, pct} | {preview} | {sending} | {done} | {error}
  const [text, setText] = useState("");

  const post = async (body) => {
    const r = await fetch(`${API}/api/ingest-bulk`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-token": apiToken }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) throw new Error(d?.reason || `error ${r.status}`);
    return d;
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!apiToken) { setStep({ error: "Primer cal la teva clau (pestanya Config)." }); return; }
    setStep({ reading: true, pct: 0 });
    try {
      const t = await readImage(f, (pct) => setStep({ reading: true, pct }));
      setText(t);
      setStep({ preview: await post({ mode: "screenshot", text: t, preview: true }) });
    } catch (err) {
      setStep({ error: err?.message || "No s'ha pogut llegir la imatge" });
    }
  };

  const send = async () => {
    setStep({ sending: true });
    try { setStep({ done: (await post({ mode: "screenshot", text })).summary }); }
    catch (err) { setStep({ error: err.message }); }
  };

  const btn = (bg, fg, extra) => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "10px 12px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", ...extra });
  const box = { marginBottom: 10, padding: 10, borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, fontSize: 13, color: C.textDim, lineHeight: 1.45 };

  return (
    <div style={{ marginBottom: 10 }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
      {!step && (
        <button onClick={() => fileRef.current?.click()} style={btn("transparent", C.accent, { width: "100%", border: `1px dashed ${C.accent}` })}>
          📷 Adjuntar una captura del xat
        </button>
      )}

      {step?.reading && (
        <div style={box}>
          Llegint la captura… {step.pct ? `${step.pct}%` : ""}
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>La primera vegada baixa el lector de text (uns segons). La imatge no surt del mòbil.</div>
          <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginTop: 6 }}>
            <div style={{ width: `${step.pct || 3}%`, height: "100%", background: C.accent, transition: "width .3s" }} />
          </div>
        </div>
      )}

      {step?.preview && (
        <div style={box}>
          {step.preview.found.length ? (
            <>
              <div style={{ fontWeight: 800, color: C.text, marginBottom: 6 }}>He trobat {step.preview.found.length === 1 ? "això" : `${step.preview.found.length} coses`}:</div>
              {step.preview.found.map((f, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <b style={{ color: f.kind === "alert" ? C.danger : C.text }}>{f.kind === "alert" ? `${KIND.alert} ${f.type}` : KIND[f.kind]}</b>
                  {f.zone ? <> · <b style={{ color: C.text }}>{f.zone}</b></> : null} · {f.when}
                  <div style={{ fontSize: 11.5, color: C.textMuted }}>«{f.text}»</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={send} style={btn(C.accent, "#000", { flex: 2 })}>Enviar</button>
                <button onClick={() => setStep(null)} style={btn("transparent", C.textDim, { flex: 1, border: `1px solid ${C.border}` })}>Cancel·lar</button>
              </div>
            </>
          ) : (
            <>
              <div>
                {step.preview.messages
                  ? `He llegit ${step.preview.messages} missatges, però cap parla d'un control.`
                  : "No he trobat missatges amb hora. Fes la captura amb les hores dels missatges visibles."}
              </div>
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 12 }}>Veure el text llegit</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, margin: "6px 0 0", color: C.textMuted }}>{text.slice(0, 1500)}</pre>
              </details>
              <button onClick={() => setStep(null)} style={btn("transparent", C.accent, { marginTop: 8, border: `1px solid ${C.border}` })}>Provar una altra captura</button>
            </>
          )}
        </div>
      )}

      {step?.sending && <div style={box}>Enviant…</div>}
      {step?.done && (
        <div style={{ ...box, color: C.success, borderColor: C.success }}>
          ✓ {step.done}
          <button onClick={() => setStep(null)} style={btn("transparent", C.accent, { display: "block", marginTop: 6, padding: "4px 0" })}>Una altra captura</button>
        </div>
      )}
      {step?.error && (
        <div style={{ ...box, color: C.danger, borderColor: C.danger }}>
          ⚠ {step.error}
          <button onClick={() => setStep(null)} style={btn("transparent", C.accent, { display: "block", marginTop: 6, padding: "4px 0" })}>Tornar-hi</button>
        </div>
      )}
    </div>
  );
}
