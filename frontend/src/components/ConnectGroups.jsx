import { useEffect, useState } from "react";
import { useC } from "../lib/themes";
import { API } from "../lib/constants";
import { detectPlatform, IOS_SHORTCUT_URL, IOS_GROUP_NAME } from "../lib/platform";

// "Connecta els teus grups" — el primer bloc de Config.
// Explica, en 4 passos curts, l'únic camí perquè els avisos dels grups d'algú entrin a
// l'app: MacroDroid al seu mòbil Android. La macro es descarrega ja feta, amb la clau
// d'aquella persona a dins, i s'importa a MacroDroid sense escriure res.
//
// A l'iPhone no hi ha MacroDroid (iOS no deixa llegir notificacions d'altres apps):
// es fa servir una drecera de l'app Dreceres que envia el missatge compartit o copiat.
// L'app detecta el sistema i només mostra la guia que toca (es pot canviar a mà).
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
  const [platform, setPlatform] = useState(() => {
    const p = detectPlatform();
    return p === "other" ? "android" : p;
  });
  const detected = detectPlatform();
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
    return () => { alive = false; };
  }, [apiToken]);

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

  const switcher = (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", fontSize: 12, color: C.textMuted }}>
      <span>{detected === "other" ? "Tria el mòbil on ho instal·laràs:" : platform === detected ? `Guia per al teu ${platform === "ios" ? "iPhone" : "Android"}` : "Guia per a un altre mòbil"}</span>
      <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {[["android", "Android"], ["ios", "iPhone"]].map(([k, l]) => (
          <button key={k} onClick={() => setPlatform(k)} aria-pressed={platform === k}
            style={{ background: platform === k ? C.accent : "transparent", color: platform === k ? C.bg : C.textDim, border: "none", padding: "5px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
    </div>
  );

  if (platform === "ios") {
    return (
      <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
        {switcher}
        <IOSSteps C={C} apiToken={apiToken} ingestUrl={ingestUrl} lastSeen={lastSeen} pendingCount={pendingCount}
          onGoToGroups={onGoToGroups} box={box} stepNum={stepNum} btn={btn} small={small} code={code} copy={copy} copied={copied} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, textAlign: "left" }}>
      {switcher}
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
            <div style={{ ...small, marginTop: 6 }}>Això és per a <b>Android</b>. Si tens iPhone, toca <b>iPhone</b> aquí dalt.</div>
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
        {stepNum(3, connected)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Comprova que funciona</div>
          <div style={small}>
            {lastSeen === undefined ? "Comprovant…"
              : connected ? <>✓ Funciona. Últim missatge {ago(lastSeen)}.</>
              : <>Encara no ha arribat res. Demana a algú que t'escrigui per WhatsApp i torna a obrir aquesta pantalla. Els grups <b>no poden estar silenciats</b>.</>}
          </div>
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

// ── iPhone: drecera de l'app Dreceres ──────────────────────────────────────────
// iOS no deixa que cap app llegeixi les notificacions de WhatsApp/Telegram, així que no
// pot ser automàtic com a Android: l'usuari comparteix (o copia) l'avís i la drecera
// l'envia a /api/ingest amb la seva clau.
function IOSSteps({ C, apiToken, ingestUrl, lastSeen, pendingCount, onGoToGroups, box, stepNum, btn, small, code, copy, copied }) {
  const [showManual, setShowManual] = useState(!IOS_SHORTCUT_URL);
  const connected = !!lastSeen;
  const row = (label, value, id, mask) => (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ flexShrink: 0, minWidth: 92 }}>{label}</span>
      <code style={code}>{mask ? `${"•".repeat(10)}${value.slice(-4)}` : value}</code>
      <button onClick={() => copy(id, value)} style={btn(C.accent, C.bg, { padding: "7px 10px", fontSize: 12 })}>{copied === id ? "✓" : "Copiar"}</button>
    </div>
  );

  return (
    <>
      <div style={{ ...box, borderColor: connected ? C.success : C.warning, background: connected ? `${C.success}14` : `${C.warning}14` }}>
        {connected ? (
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
            <b style={{ color: C.success }}>✓ La drecera ja envia avisos.</b> Últim missatge rebut {ago(lastSeen)}.
          </div>
        ) : (
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
            <b style={{ color: C.warning }}>A l'iPhone, els avisos s'envien amb una drecera.</b>{" "}
            L'iPhone no deixa llegir les notificacions de WhatsApp, així que no és automàtic: quan vegis un avís,
            el comparteixes (o el copies) i la drecera <b>PatrolTrack</b> l'envia en un toc.
          </div>
        )}
      </div>

      {/* Pas 1 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(1, connected)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Copia la teva clau</div>
          <button onClick={() => copy("ios-token", apiToken)} style={btn(C.accent, C.bg)}>{copied === "ios-token" ? "✓ Clau copiada" : "Copiar la meva clau"}</button>
          <div style={small}>La drecera te la demanarà en instal·lar-la. És personal: no la passis a ningú.</div>
        </div>
      </div>

      {/* Pas 2 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(2, connected)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Afegeix la drecera PatrolTrack</div>
          {IOS_SHORTCUT_URL ? (
            <>
              <a href={IOS_SHORTCUT_URL} target="_blank" rel="noopener noreferrer" style={btn(C.accent, C.bg)}>Obrir a Dreceres</a>
              <div style={small}>S'obrirà l'app <b>Dreceres</b>. Toca <b>Afegir drecera</b> i, quan et demani la clau, <b>enganxa-la</b>.</div>
            </>
          ) : (
            <div style={small}>Obre l'app <b>Dreceres</b> (ve amb l'iPhone; si no hi és, és gratis a l'App Store) i crea-la amb aquestes dades:</div>
          )}
          <button onClick={() => setShowManual((v) => !v)} style={{ background: "none", border: "none", color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>
            {showManual ? "▾" : "▸"} {IOS_SHORTCUT_URL ? "Fer-ho a mà" : "Com crear-la"}
          </button>
          {showManual && (
            <div style={{ ...box, display: "grid", gap: 8, fontSize: 12.5, color: C.textDim, lineHeight: 1.5 }}>
              <div><b>1.</b> Dreceres → <b>+</b> → posa-li de nom <b>PatrolTrack</b>.</div>
              <div><b>2.</b> Toca <b>ⓘ</b> → activa <b>Mostrar al full de compartir</b>. A dalt, on diu «Rebre … de», deixa només <b>Text</b> i, a «Si no hi ha entrada», tria <b>Obtenir el porta-retalls</b>.</div>
              <div><b>3.</b> Afegeix l'acció <b>Obtenir el contingut de l'URL</b> (cerca «URL»). Posa-hi:</div>
              {row("URL", ingestUrl, "ios-url")}
              <div>Mètode <b>POST</b>. A <b>Capçaleres</b> afegeix:</div>
              {row("x-ingest-token", apiToken, "ios-token2", true)}
              <div>A <b>Cos de la sol·licitud</b> tria <b>JSON</b> i afegeix tres camps de text:</div>
              <div style={{ display: "grid", gap: 3, paddingLeft: 8 }}>
                <div><b>message</b> → la variable <b>Entrada de la drecera</b></div>
                <div><b>group_name</b> → <code>{IOS_GROUP_NAME}</code></div>
                <div><b>source</b> → <code>whatsapp</code></div>
              </div>
              <div><b>4.</b> Afegeix <b>Mostrar notificació</b> amb el <b>Contingut de l'URL</b>, per veure si ha arribat.</div>
            </div>
          )}
        </div>
      </div>

      {/* Pas 3 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(3, connected)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Com s'envia un avís</div>
          <div style={small}>
            <b>WhatsApp:</b> mantén premut l'avís → <b>Reenviar</b> → icona de compartir (a baix a l'esquerra) → <b>PatrolTrack</b>.<br />
            <b>Telegram:</b> mantén premut l'avís → <b>Copiar</b> i executa la drecera (des de la pantalla d'inici, un widget o «Ei Siri, PatrolTrack»).
          </div>
        </div>
      </div>

      {/* Pas 4 */}
      <div style={{ display: "flex", gap: 10 }}>
        {stepNum(4, connected)}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, color: C.text }}>Prova-la i activa-la</div>
          <div style={small}>
            {lastSeen === undefined ? "Comprovant…"
              : connected ? <>✓ Funciona. Últim missatge {ago(lastSeen)}.</>
              : <>Copia un avís qualsevol i executa la drecera. La primera vegada sortirà «grup nou»: a <b>Els meus grups</b> toca <b>Seguir</b> a <b>{IOS_GROUP_NAME}</b> i ja està.</>}
          </div>
          {onGoToGroups && (
            <button onClick={onGoToGroups} style={btn("transparent", C.accent, { border: `1px solid ${C.accent}`, padding: "9px 12px", fontSize: 13 })}>
              Anar a Els meus grups{pendingCount ? ` · ${pendingCount} per triar` : ""}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
