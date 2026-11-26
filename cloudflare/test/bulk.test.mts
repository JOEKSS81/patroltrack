import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScreenshot, madridToUtc, cleanBlock } from "../src/bulkParse.ts";
import { extractPatrolInfo, classifyFollowUp } from "../src/extractor.ts";

const hhmm = (ms: number) => new Intl.DateTimeFormat("ca-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
const ymd = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date(ms));

test("madridToUtc: hivern +1 i estiu +2", () => {
  assert.equal(new Date(madridToUtc(2026, 11, 26, 10, 21)).toISOString(), "2026-11-26T09:21:00.000Z");
  assert.equal(new Date(madridToUtc(2026, 7, 15, 10, 21)).toISOString(), "2026-07-15T08:21:00.000Z");
});

test("captura típica de WhatsApp (iPhone): capçalera fora, hores i textos", () => {
  const now = madridToUtc(2026, 11, 26, 10, 47);
  const ocr = [
    "10:47", "5G", "87", "< 12", "Controls Pallars Sort", "Joan, Maria, Pep, Tú",
    "~ Joan", "Control GC a la rotonda de Sort", "de pujada 10:21",
    "~ Maria", "Segueixen? 10:35 ",
    "Pep", "Ja han marxat de Sort 10:44 √√",
    "Escribe un mensaje",
  ].join("\n");
  const msgs = parseScreenshot(ocr, now);
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].text, "Control GC a la rotonda de Sort de pujada");
  assert.equal(hhmm(msgs[0].t), "10:21");
  assert.ok(extractPatrolInfo(msgs[0].text, "whatsapp"));
  assert.equal(classifyFollowUp(msgs[2].text)?.kind, "cleared");
});

test("separadors Ayer / Hoy i hores 'del futur' sense separador", () => {
  const now = madridToUtc(2026, 11, 26, 9, 0);
  const msgs = parseScreenshot(["Ayer", "Mossos a Tremp 22:10", "Hoy", "Policia a Sort 08:30"].join("\n"), now);
  assert.equal(ymd(msgs[0].t), "2026-11-25");
  assert.equal(ymd(msgs[1].t), "2026-11-26");
  const fut = parseScreenshot("~ Pep\nControl a Sort 23:50", now);
  assert.equal(ymd(fut[0].t), "2026-11-25");
});

test("text sense cap hora: res", () => {
  assert.equal(parseScreenshot("Hola\nquè tal").length, 0);
});

test("captura llegida amb soroll: ✓✓ com «--» i el nom com «xv Joan»", () => {
  const now = madridToUtc(2026, 11, 26, 17, 13);
  const ocr = ["17:13 56 87", "< 12 Avisos Pallars", "Hoy", "xv Joan", "Control de la Guardia Civil a la rotonda", "de Sort de pujada 16:33",
    "- Maria", "Encara hi són? 16:48", "Sí, segueixen 16:53 --", "Pep", "Ja han marxat de Sort 17:07"].join("\n");
  const msgs = parseScreenshot(ocr, now);
  assert.deepEqual(msgs.map((m) => m.text), [
    "Control de la Guardia Civil a la rotonda de Sort de pujada", "Encara hi són?", "Sí, segueixen", "Ja han marxat de Sort",
  ]);
});

// Casos com els de la primera captura real (noms i telèfons inventats)
test("només el missatge: fora noms, telèfons, «Reenviado», «X añadió a» i soroll", () => {
  const sort = (l: string) => /sort|tremp|pobla/i.test(l);
  assert.equal(cleanBlock(["- Brulus +34 600 11 22 33", "a Gc rotonda de Sort de pujada"], sort), "a Gc rotonda de Sort de pujada");
  assert.equal(cleanBlock(["- NBGM Y añadió a — E.", "- constru... +34 600 00 00 01", "mM Reenviado", "Control en la salida de tremp a pobla", "Pasando el esclat"], sort),
    "Control en la salida de tremp a pobla Pasando el esclat");
  assert.equal(cleanBlock(["- Xavier 434 600 11 22 33", "Estan pujant 8/10 motos d mossos"], sort), "Estan pujant 8/10 motos d mossos");
  assert.equal(cleanBlock(["Oriol Fontelles", "Mossos cementiri de Pobla. Paren"], sort), "Mossos cementiri de Pobla. Paren");
  assert.equal(cleanBlock(["-Paula Y $ +34663 100200 E", "Control central talarn"], sort), "Control central talarn");
  // una línia curta que diu un lloc no és un nom
  assert.equal(cleanBlock(["Sort", "GC pujant"], sort), "Sort GC pujant");
  assert.equal(cleanBlock(["Sí"], sort), "Sí");
});

test("capçalera amb soroll del lector («< … en línea») abans del primer missatge", () => {
  const now = madridToUtc(2026, 11, 26, 13, 40);
  const ocr = ["17:31 ul 56 ES", "| 9 Reca i | |", "ptadors Finder I < y 5 en línea", "KO ns", "—-MRDB —134685 126765 m", "Cruse tornafort brut 13:34"].join("\n");
  assert.deepEqual(parseScreenshot(ocr, now).map((m) => m.text), ["Cruse tornafort brut"]);
});
