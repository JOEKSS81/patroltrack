// Proves del filtre de missatges. Executa: npm test (dins cloudflare/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPatrolInfo } from "../src/extractor.ts";

// [missatge, tipus esperat, zona esperada]
const AVISOS: [string, string, string][] = [
  ["Mossos a la N-II km 45", "mossos", "N-II"],
  ["Mossos a Organyà", "mossos", "Organyà"],
  ["Mossos parats a la sortida de la Seu", "mossos", "La Seu d'Urgell"],
  ["Guardia civil sortint de Sort", "guardia", "Sort"],
  ["GC a la C-13 altura Gerri", "guardia", "C-13"],
  ["Civils a Coll de Nargó", "guardia", "Coll de Nargó"],
  ["Pitufos a Oliana", "mossos", "Oliana"],
  ["Control a la sortida de la Seu", "unknown", "La Seu d'Urgell"],
  ["Ull! verds a la rotonda d'Adrall", "guardia", "Adrall"],
  ["Radar Tremp", "unknown", "Tremp"],
  ["Atestat mossos a Ponts", "mossos", "Ponts"],
  ["Policía local en la rotonda de Balaguer", "local", "Balaguer"],
  ["Alcoholèmia a l'entrada de Mollerussa", "unknown", "Mollerussa"],
  ["Ojo, guardia civil camuflados C-14 dirección Ponts", "guardia", "C-14"],
  ["Hi ha un control de mossos a Organyà", "mossos", "Organyà"],
];

const NO_AVISOS = [
  "Hi ha mossos a Organyà?",
  "Algú sap si hi ha control a la C-14",
  "Ja no hi ha res a la C-14, via lliure",
  "No hi ha mossos a Oliana",
  "Ya se han ido de la N-II",
  "Ahir hi havia mossos a Tremp",
  "Avui la piscina municipal està tancada",
  "Bon dia a tothom",
  "Demà sopar a la Seu?",
  "M'he comprat un full nou per a la impressora",
];

for (const [msg, tipus, zona] of AVISOS) {
  test(`avís: ${msg}`, () => {
    const r = extractPatrolInfo(msg, "whatsapp");
    assert.ok(r, "hauria de ser un avís");
    assert.equal(r.patrol_type, tipus);
    assert.equal(r.zone_norm, zona);
  });
}

for (const msg of NO_AVISOS) {
  test(`no és avís: ${msg}`, () => {
    assert.equal(extractPatrolInfo(msg, "whatsapp"), null);
  });
}
