import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScreenshot, madridToUtc } from "../src/bulkParse.ts";
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
    "Control de la Guardia Civil a la rotonda de Sort de pujada", "Encara hi són?", "Sí, segueixen", "Pep Ja han marxat de Sort",
  ]);
});
