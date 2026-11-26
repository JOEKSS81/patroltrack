// PROVA TEMPORAL (vegeu bulk.ts): llegeix el text d'una captura de pantalla de WhatsApp.
// Fitxer sense dependències perquè es pugui provar sol (test/bulk.test.mts).
export type Msg = { t: number; text: string };

// ── Hora de Madrid ─────────────────────────────────────────────────────────────
export function madridParts(ms: number) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hour12: false, weekday: "short",
  }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  const dows: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: +g("year"), m: +g("month"), d: +g("day"), hour: +g("hour") % 24, minute: +g("minute"), dow: dows[g("weekday")] ?? 0 };
}
// Data i hora de Madrid → instant UTC (té en compte l'horari d'estiu)
export function madridToUtc(y: number, m: number, d: number, hh: number, mm: number): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = (ms: number) => { const p = madridParts(ms); return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000; };
  let t = guess - off(guess);
  t = guess - off(t);
  return t;
}

// ── Captura de pantalla: text llegit per l'iPhone → missatges amb hora ──────────
// L'iPhone (Live Text) llegeix la pantalla de dalt a baix. Cada bombolla acaba amb
// l'hora ("Control a Sort 10:21"); els separadors "Hoy", "Ayer", "Lunes"… diuen el dia.
const DAY_WORDS: Record<string, number> = {
  hoy: 0, avui: 0, today: 0, ayer: 1, ahir: 1, yesterday: 1,
};
const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
  diumenge: 0, dilluns: 1, dimarts: 2, dimecres: 3, dijous: 4, divendres: 5, dissabte: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
// L'hora al final de la bombolla; després hi poden anar les marques de llegit, que el
// lector de text pot llegir com "✓✓", "√√", "//", "W", "vv"…
const TIME_END = /(?:^|\s)(\d{1,2})[:.](\d{2})(?:\s*([ap])\.?\s?m\.?)?(?:\s*[✓✔√/\\vVwW«»"'*~\-–—]{1,3})?\s*$/i;
const SKIP_LINE = /^(escrib[ea] un mensaje|escriu un missatge|type a message|mensaje|missatge|\d+\s+(mensajes? no le[ií]dos?|missatges? no llegits?|unread messages?)|los mensajes y las llamadas est[aá]n cifrados|els missatges i les trucades|messages and calls are end-to-end|en l[ií]nea|en l[ií]nia|online|escribiendo\.*|escrivint\.*|typing\.*)$/i;
const HEADER_LINE = /^([<‹〈く]\s*\d*|\d{1,3}%?|[345]g|lte|wi-?fi|t[uú]|you|.*,\s*(t[uú]|you)|.*,.*,.*|toca (aqu[ií]|para)|clica aqu[ií]|tap here.*)$/i;

function dayFromSeparator(line: string, todayMs: number): number | null {
  const l = line.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (l in DAY_WORDS) return todayMs - DAY_WORDS[l] * 86_400_000;
  if (l in WEEKDAYS) {
    const back = (madridParts(todayMs).dow - WEEKDAYS[l] + 7) % 7 || 7;
    return todayMs - back * 86_400_000;
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(l);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return madridToUtc(y, +m[2], +m[1], 12, 0);
  }
  return null;
}

export function parseScreenshot(text: string, nowMs = Date.now()): Msg[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[‎‏]/g, "").trim()).filter(Boolean);
  const today = madridParts(nowMs);
  const todayNoon = madridToUtc(today.y, today.m, today.d, 12, 0);
  let day: number | null = null;   // migdia del dia que diu el separador (o null: avui)
  let sawSeparator = false;
  let first = true;
  let buf: string[] = [];
  const out: Msg[] = [];
  for (const line of lines) {
    const sep = dayFromSeparator(line, todayNoon);
    if (sep !== null) { day = sep; sawSeparator = true; buf = []; first = false; continue; }
    if (SKIP_LINE.test(line)) continue;
    const tm = TIME_END.exec(line);
    if (!tm) { buf.push(line); continue; }
    const rest = line.slice(0, tm.index).trim();
    if (rest) buf.push(rest);
    // Primer bloc sense separador: hi ha la capçalera (hora, bateria, nom del grup,
    // participants…). Es descarta tot fins a l'última línia que sembla capçalera.
    if (first && !sawSeparator) {
      let cut = -1;
      buf.forEach((l, i) => { if (HEADER_LINE.test(l)) cut = i; });
      if (cut >= 0) buf = buf.slice(cut + 1);
    }
    // Fora el nom de qui escriu: "~ Joan" (el lector el pot llegir "xv Joan", "- Maria"…) i telèfons
    const body = buf.filter((l) => !/^(~|xv|x|-|–|—|»|\*)\s*\p{L}[\p{L} .'-]{0,24}$/u.test(l) && !/^~/.test(l) && !/^\+?\d[\d\s-]{7,}$/.test(l)).join(" ").replace(/\s+/g, " ").trim();
    buf = [];
    if (body.length < 2) continue; // p. ex. l'hora de la barra d'estat, a dalt de tot
    first = false;
    let hh = +tm[1]; const mm = +tm[2];
    if (tm[3]) { const pm = tm[3].toLowerCase() === "p"; if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
    if (hh > 23 || mm > 59) continue;
    const base = madridParts(day ?? todayNoon);
    let t = madridToUtc(base.y, base.m, base.d, hh, mm);
    if (day === null && t > nowMs + 5 * 60_000) t -= 86_400_000; // sense separador i "al futur": era ahir
    out.push({ t, text: body.slice(0, 1000) });
  }
  return out;
}

