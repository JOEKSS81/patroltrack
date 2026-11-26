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
  "Comprobando si hay mensajes nuevos",
  "Comprovant si hi ha missatges nous",
  "5 mensajes de 3 chats",
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

// Argot: "bruta" = hi ha control, "neta" = ja han marxat
import { classifyFollowUp } from "../src/extractor.ts";
const BRUTA: [string, string][] = [
  ["Rotonda de Sort bruta", "Sort"],
  ["Sortida de Tremp bruta", "Tremp"],
  ["Bruta la rotonda de la Seu", "La Seu d'Urgell"],
  ["Rotonda bruta", "Desconeguda"],
];
for (const [msg, zona] of BRUTA) {
  test(`bruta és avís: ${msg}`, () => {
    const r = extractPatrolInfo(msg, "whatsapp");
    assert.ok(r, "hauria de ser un avís");
    assert.equal(r!.zone_norm, zona);
  });
}
for (const msg of ["La carretera està bruta de neu", "Tinc el cotxe brut", "Quina roba més bruta", "Bruta"]) {
  test(`bruta no és avís: ${msg}`, () => assert.equal(extractPatrolInfo(msg, "whatsapp"), null));
}
test("neta / bruta com a seguiment", () => {
  assert.equal(classifyFollowUp("Rotonda neta")?.kind, "cleared");
  assert.equal(classifyFollowUp("Sort net")?.kind, "cleared");
  assert.equal(classifyFollowUp("Bruta")?.kind, "still");
  assert.equal(classifyFollowUp("Encara bruta?")?.kind, "ask");
});

// Casos reals que no entraven (novembre 2026)
const REALS: [string, string, string][] = [
  ["Creu roja Tremp brutaa", "unknown", "Tremp"],
  ["Tremp GC", "guardia", "Tremp"],
  ["Policia a Sort", "unknown", "Sort"],
  ["Poli a la rotonda de Sort", "unknown", "Sort"],
];
for (const [msg, tipus, zona] of REALS) {
  test(`cas real: ${msg}`, () => {
    const r = extractPatrolInfo(msg, "whatsapp");
    assert.ok(r, "hauria de ser un avís");
    assert.equal(r!.patrol_type, tipus);
    assert.equal(r!.zone_norm, zona);
  });
}
test("lletres allargades: «Sort netaaa» tanca el control", () => assert.equal(classifyFollowUp("Sort netaaa")?.kind, "cleared"));
test("«Polígon» no és «poli»", () => assert.equal(extractPatrolInfo("Anem al polígon de Sort a dinar", "whatsapp"), null));
