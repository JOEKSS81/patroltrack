import { useEffect, useRef, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";

// "Connecta els teus grups" — el primer bloc de Config.
// Explica, en 4 passos curts, l'únic camí perquè els avisos dels grups d'algú entrin a
// l'app: MacroDroid al seu mòbil Android. La macro es descarrega ja feta, amb la clau
// d'aquella persona a dins, i s'importa a MacroDroid sense escriure res.
//
// Plantilles: /macros/whatsapp.macro i /macros/telegram.macro (exportades de MacroDroid)
// amb el text __PT_TOKEN__ on va la clau i __PT_URL__ on va l'adreça. Si encara no hi
// són, el pas 2 mostra la configuració a mà.
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid";
const SOURCES = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "telegram", label: "Telegram" },
];
const bodyFor = (src) => `{"message":"{notification}","group_name":"{not_title}","source":"${src}"}`;

function ago(iso) {
  if (!iso) return null;
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "ara mateix";
  if (m < 60) return `fa ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `fa ${h} h`;
  return `fa ${Math.round(h / 24)} dies`;
}

export default function ConnectGroups({ apiToken, onGoToGroups }) {
  const C = useC();
  const [templates, setTemplates] = useState({});   // { whatsapp: "…", telegram: "…" }
  const [lastSeen, setLastSeen] = useState(undefined); // undefined = carregant, null = mai
  const [pendingCount, setPendingCount] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [copied, setCopied] = useState(null);
  // Botó "Comprovar": null | {state:"waiting", left} | {state:"ok", ...} | {state:"fail", authFail}
  const [probe, setProbe] = useState(null);
  const probeRef = useRef(null);
  useEffect(() => () => clearInterval(probeRef.current), []);
  const ingestUrl = `${API || window.location.origin}/api/ingest`;

  // Plantilles de macro publicades amb l'app (Cloudflare retorna index.html si no hi són:
  // per això es comprova que sigui JSON amb el lloc de la clau).
  useEffect(() => {
    let alive = true;
    SOURCES.forEach(({ key }) => {
      fetch(`/macros/${key}.macro`, { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((t) => { if (alive && t.trim().startsWith("{") && t.includes("__PT_TOKEN__")) setTemplates((p) => ({ ...p, [key]: t })); })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, []);

  // Pas 3: el servidor diu quan va arribar l'últim missatge d'aquest mòbil
  useEffect(() => {
    if (!apiToken) return;
    let alive = true;
    fetch(`${API}/api/group-settings`, { headers: { "x-ingest-token": apiToken } })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const gs = d.groups || [];
        const last = gs.map((g) => g.last_seen).filter(Boolean).sort().pop() || null;
        setLastSeen(last);
        setPendingCount(gs.filter((g) => g.status === "pending").length);
      })
      .catch(() => { if (alive) setLastSeen(null); });
    // L'últim missatge de qualsevol mena (també dels grups per triar o les proves de MacroDroid)
    fetch(`${API}/api/ingest-check`, { headers: { "x-ingest-token": apiToken } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && d.last_at) setLastSeen((prev) => (prev && prev > d.last_at ? prev : d.last_at)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiToken]);

  // Comprovació en directe: si fa poc que ha arribat res, ja està; si no, espera fins a 90 s
  // que arribi alguna cosa nova (la prova de MacroDroid o un missatge de WhatsApp).
  const PROBE_SECONDS = 90;
  const runProbe = async () => {
    clearInterval(probeRef.current);
    const started = Date.now();
    const ask = () => fetch(`${API}/api/ingest-check`, { headers: { "x-ingest-token": apiToken }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const success = (d, fresh) => {
      clearInterval(probeRef.current);
      setLastSeen(d.last_at);
      setPendingCount(d.groups_pending || 0);
      setProbe({ state: "ok", fresh, at: d.last_at, group: d.last_group, outcome: d.last_outcome, pending: d.groups_pending || 0 });
    };
    setProbe({ state: "waiting", left: PROBE_SECONDS });
    const first = await ask();
    if (first && first.last_at && Date.now() - Date.parse(first.last_at) < 10 * 60_000) { success(first, false); return; }
    probeRef.current = setInterval(async () => {
      const left = Math.max(0, PROBE_SECONDS - Math.round((Date.now() - started) / 1000));
      const d = await ask();
      if (d && d.last_at && Date.parse(d.last_at) >= started - 2000) { success(d, true); return; }
      if (left <= 0) {
        clearInterval(probeRef.current);
        setProbe({ state: "fail", authFail: !!(d && d.auth_fail_at && Date.parse(d.auth_fail_at) >= started - 60_000) });
      } else setProbe({ state: "waiting", left });
    }, 3000);
  };
  const cancelProbe = () => { clearInterval(probeRef.current); setProbe(null); };

  const download = (key, label) => {
    const text = templates[key].split("__PT_TOKEN__").join(apiToken).split("__PT_URL__").join(ingestUrl);
    const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url; a.download = `PatrolTrack ${label}.macro`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const copy = (id, text) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };

  const hasTemplates = SOURCES.every(({ key }) => templates[key]);
  const connected = !!lastSeen;

  const box = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 };
  const stepNum = (n, done) => (
    <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 900, background: done ? C.success : C.accent, color: C.bg }}>{done ? "✓" : n}</div>
  );
  const btn = (bg, fg, extra) => ({ background: bg, color: fg, border: "none", borderRadius: 9, padding: "11px 12px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", textDecoration: "none", display: "block", ...extra });
  const small = { fontSize: 12.5, color: C.textDim, lineHeight: 1.5 };
  const code = { display: "block", fontSize: 11, color: C.text, background: C.surface, padding: 7, borderRadius: 6, wordBreak: "break-all", flex: 1, minWidth: 0 };

  if (!apiToken) {
    return (
      <div style={{ ...box, borderColor: C.warning }}>
        <div style={{ fontWeight: 800, color: C.warning, marginBottom: 4 }}>Primer, obre el teu enllaç personal</div>
        <div style={small}>Qui t'ha passat l'app t'ha d'enviar un enllaç només per a tu. Obre'l des d'aquest mòbil i torna aquí.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
      {/* L'avís important, el primer */}
      <div style={{ ...box, borderColor: connected ? C.success : C.warning, background: connected ? `${C.success}14` : `${C.warning}14` }}>
        {connected ? (
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
            <b style={{ color: C.success }}>✓ El teu mòbil ja envia avisos.</b> Últim missatge rebut {ago(lastSeen)}.
          </div>
        ) : (
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
            <b style={{ color: C.warning }}>Sense MacroDroid, els avisos dels teus grups no arriben a l'app.</b>{" "}
            MacroDroid llegeix les notificacions de WhatsApp i Telegram del teu mòbil i les envia aquí.
            <div style={{ ...small, marginTop: 6 }}>Només funciona amb <b>Android</b>. Amb iPhone pots veure els avisos de tothom i avisar a mà amb el botó <b>+</b>.</div>
          </div>
        )}
      </div>

      {/* Pas 1 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(1, connected)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Instal·la MacroDroid</div>
          <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" style={btn(C.accent, C.bg)}>Obrir a Google Play</a>
          <div style={small}>Quan l'obris, deixa-li <b>llegir les notificacions</b>. Després, al mòbil: Ajustos → Aplicacions → MacroDroid → Bateria → <b>Sense restriccions</b>.</div>
        </div>
      </div>

      {/* Pas 2 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(2, connected)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Afegeix la macro de PatrolTrack</div>
          {hasTemplates ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {SOURCES.map(({ key, label }) => (
                  <button key={key} onClick={() => download(key, label)} style={btn(C.surface, C.text, { border: `1px solid ${C.border}` })}>⬇ {label}</button>
                ))}
              </div>
              <div style={small}>Ja porten la teva clau. A MacroDroid: menú <b>☰</b> → <b>Exportar/Importar</b> → <b>Importar</b> → tria el fitxer. Fes-ho amb els dos.</div>
            </>
          ) : (
            <div style={small}>Crea a MacroDroid una macro per a WhatsApp i una altra per a Telegram amb les dades de «Fer-ho a mà», aquí sota.</div>
          )}
          <button onClick={() => setShowManual((v) => !v)} style={{ background: "none", border: "none", color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>
            {showManual ? "▾" : "▸"} Fer-ho a mà
          </button>
          {showManual && (
            <div style={{ ...box, display: "grid", gap: 7, fontSize: 12.5, color: C.textDim, lineHeight: 1.5 }}>
              <div><b>Disparador:</b> Notificació rebuda → WhatsApp (o Telegram)</div>
              <div><b>Acció:</b> Petició HTTP · POST · tipus application/json</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}><code style={code}>{ingestUrl}</code><button onClick={() => copy("url", ingestUrl)} style={btn(C.accent, C.bg, { padding: "7px 10px", fontSize: 12 })}>{copied === "url" ? "✓" : "Copiar"}</button></div>
              <div>Capçalera <b>x-ingest-token</b> = la teva clau</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}><code style={code}>{"•".repeat(10)}{apiToken.slice(-4)}</code><button onClick={() => copy("token", apiToken)} style={btn(C.accent, C.bg, { padding: "7px 10px", fontSize: 12 })}>{copied === "token" ? "✓" : "Copiar"}</button></div>
              {SOURCES.map(({ key, label }) => (
                <div key={key}>
                  <div>Cos per a <b>{label}</b>:</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}><code style={code}>{bodyFor(key)}</code><button onClick={() => copy(key, bodyFor(key))} style={btn(C.accent, C.bg, { padding: "7px 10px", fontSize: 12 })}>{copied === key ? "✓" : "Copiar"}</button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pas 3 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(3, connected || probe?.state === "ok")}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Comprova que funciona</div>
          {!probe && (
            <>
              <button onClick={runProbe} style={btn(C.accent, C.bg)}>🔍 Comprovar ara</button>
              <div style={small}>
                {lastSeen === undefined ? "Mirant l'últim missatge…"
                  : connected ? <>Últim missatge del teu mòbil {ago(lastSeen)}.</>
                  : <>Encara no ha arribat res del teu mòbil.</>}
              </div>
            </>
          )}
          {probe?.state === "waiting" && (
            <div style={{ ...box, borderColor: C.accent, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13.5, color: C.text, fontWeight: 800 }}>⏳ Esperant un missatge… {probe.left} s</div>
              <div style={small}>
                Ara, a <b>MacroDroid</b>: obre la macro <b>PatrolTrack</b>, toca <b>⋮</b> → <b>Provar accions</b> («Probar acciones»).
                O demana a algú que t'escrigui per WhatsApp. Torna aquí: es marcarà sol.
              </div>
              <button onClick={cancelProbe} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>Cancel·lar</button>
            </div>
          )}
          {probe?.state === "ok" && (
            <div style={{ ...box, borderColor: C.success, background: `${C.success}14`, display: "grid", gap: 4 }}>
              <div style={{ fontSize: 14, color: C.success, fontWeight: 800 }}>✓ Funciona!</div>
              <div style={small}>
                {probe.fresh ? "Acaba d'arribar" : `Va arribar ${ago(probe.at)}`} un missatge del teu mòbil{probe.group ? <> (<b>{probe.group}</b>)</> : ""}.
                {probe.outcome === "group_pending" ? <> Aquest grup encara està <b>per triar</b>: ves al pas 4.</> : null}
              </div>
              <button onClick={() => setProbe(null)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>D'acord</button>
            </div>
          )}
          {probe?.state === "fail" && (
            <div style={{ ...box, borderColor: C.danger, background: `${C.danger}10`, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 14, color: C.danger, fontWeight: 800 }}>✗ No ha arribat res</div>
              {probe.authFail ? (
                <div style={small}>Ha arribat un missatge però amb una <b>clau que no és la teva</b>. Torna a fer el pas 2 des d'aquest mòbil (esborra la macro vella de MacroDroid).</div>
              ) : (
                <div style={{ ...small, display: "grid", gap: 3 }}>
                  <div>Revisa, per ordre:</div>
                  <div>1. MacroDroid té permís per <b>llegir les notificacions</b>.</div>
                  <div>2. La macro PatrolTrack està <b>activada</b> (interruptor verd).</div>
                  <div>3. Bateria de MacroDroid: <b>Sense restriccions</b>.</div>
                  <div>4. Els grups de WhatsApp <b>no estan silenciats</b>.</div>
                </div>
              )}
              <button onClick={runProbe} style={btn(C.accent, C.bg)}>Tornar a provar</button>
            </div>
          )}
        </div>
      </div>

      {/* Pas 4 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(4, false)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Tria quins grups segueixes</div>
          <div style={small}>Els teus grups apareixen sols a «Els meus grups». Toca <b>Seguir</b> als d'avisos i <b>Ignorar</b> als xats privats: d'aquests no es desa res.</div>
          {onGoToGroups && (
            <button onClick={onGoToGroups} style={btn("transparent", C.accent, { border: `1px solid ${C.accent}`, padding: "9px 12px", fontSize: 13 })}>
              Anar a Els meus grups{pendingCount ? ` · ${pendingCount} per triar` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
