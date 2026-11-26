// PROVA TEMPORAL: llegeix un xat exportat de WhatsApp (.txt d'Android o .zip d'iPhone)
// i en treu els missatges amb la seva data i hora. Es fa al mòbil: al servidor només
// hi va el text de cada missatge amb l'hora (vegeu components/ImportChat.jsx).

const MAX_DAYS = 180; // el model només en fa servir 180 dies

// ── .zip de l'iPhone ("WhatsApp Chat - Grup.zip" amb _chat.txt a dins) ─────────
async function unzipFirstTxt(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip no vàlid");
  const entries = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  for (let n = 0; n < entries; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commLen;
    if (!/\.txt$/i.test(name) || name.startsWith("__MACOSX")) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = new Uint8Array(buf, start, csize);
    if (method === 0) return new TextDecoder().decode(data);
    if (method !== 8) throw new Error("zip comprimit d'una manera desconeguda");
    if (typeof DecompressionStream === "undefined") throw new Error("Aquest mòbil no pot obrir .zip: descomprimeix-lo i tria el _chat.txt");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  }
  throw new Error("Dins el .zip no hi ha cap xat (.txt)");
}

export async function readChatFile(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  return isZip ? await unzipFirstTxt(buf) : new TextDecoder().decode(buf);
}

// "WhatsApp Chat - Controls Pallars.zip", "Chat de WhatsApp con X.txt"… → "Controls Pallars"
export function groupFromFileName(name) {
  return (name || "")
    .replace(/\.(zip|txt)$/i, "")
    .replace(/^(whatsapp chat( with| -)?|chat de whatsapp( con| amb| -)?|xat de whatsapp( amb| -)?|conversa de whatsapp( amb| -)?)\s*/i, "")
    .replace(/^[-–\s]+/, "").trim() || "Xat importat";
}

// ── Línies del xat ─────────────────────────────────────────────────────────────
//   iPhone:  [26/11/26, 10:42:13] Joan: Control a Sort
//   Android: 26/11/26, 10:42 - Joan: Control a Sort      (també "10:42 p. m.")
const LINE = /^‎?\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap])?\.?\s?(?:m\.?)?\]?\s*[-–]?\s*(.*)$/i;
const SKIP = /^(<?(multimedia omitido|media omitted|archivo omitido|fitxer om[eè]s)>?|.*\b(omitid[oa]|omitted|om[eè]s)$|null|se elimin[oó] este mensaje|eliminaste este mensaje|this message was deleted|you deleted this message|s'ha suprimit aquest missatge|<adjunto:.*>|<attached:.*>)$/i;

export function parseChat(text, now = Date.now()) {
  const rows = [];
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  for (const raw of lines) {
    const m = LINE.exec(raw);
    if (!m) { // línia de continuació d'un missatge llarg
      if (rows.length && raw.trim()) rows[rows.length - 1].text += "\n" + raw.trim();
      continue;
    }
    rows.push({ a: +m[1], b: +m[2], y: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0), ap: (m[7] || "").toLowerCase(), rest: m[8] || "", text: null });
    const r = rows[rows.length - 1];
    const colon = r.rest.indexOf(": ");
    // Sense "Nom: text" o amb la marca invisible de l'iPhone: missatge del sistema o fitxer
    if (colon < 0 || r.rest.slice(colon + 2).startsWith("‎")) { r.text = null; continue; }
    r.text = r.rest.slice(colon + 2);
  }
  // Dia/mes o mes/dia: si algun primer número passa de 12 és dia/mes (Espanya, per defecte)
  const monthFirst = !rows.some((r) => r.a > 12) && rows.some((r) => r.b > 12);
  const since = now - MAX_DAYS * 86_400_000;
  const out = [];
  for (const r of rows) {
    if (r.text == null) continue;
    const text = r.text.trim();
    if (text.length < 2 || SKIP.test(text)) continue;
    const day = monthFirst ? r.b : r.a, month = monthFirst ? r.a : r.b;
    const year = r.y < 100 ? 2000 + r.y : r.y;
    let h = r.h;
    if (r.ap === "p" && h < 12) h += 12;
    if (r.ap === "a" && h === 12) h = 0;
    const t = new Date(year, month - 1, day, h, r.mi, r.s).getTime(); // hora del mòbil (Espanya)
    if (!Number.isFinite(t) || t < since || t > now + 600_000) continue;
    out.push({ t: new Date(t).toISOString(), text: text.slice(0, 1000) });
  }
  return out;
}
