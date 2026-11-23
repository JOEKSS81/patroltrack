// Proves del model de possibilitat. Executa: npm test (dins cloudflare/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel, zoneProbability, zoneProbsResponse, probabilityResponse, localTime, type DetRow, type EventRow } from "../src/risk.ts";

// Dades reals (novembre 2026): avisos desats i els seguiments que hi van arribar.
const D = (id: number, created_at: string, zone_norm: string, patrol_type: string, group_name: string, confidence = "mitja"): DetRow =>
  ({ id, created_at, zone_norm, patrol_type, confidence, group_name, source: "whatsapp" });
const DETS: DetRow[] = [
  D(1, "2026-05-25T23:28:37.838Z", "N-II", "mossos", "Test", "alta"),
  D(8, "2026-11-20T12:42:48.217Z", "Tornafort", "mossos", "Controlant"),
  D(14, "2026-11-22T08:06:47.902Z", "Sort", "mossos", "Controlant"),
  D(15, "2026-11-22T17:47:11.045Z", "La Pobla de Segur", "guardia", "Andeandaran"),
  D(16, "2026-11-23T08:18:05.505Z", "Sort", "mossos", "Controlant"),
  D(17, "2026-11-23T09:24:00.212Z", "Sort", "mossos", "Gossos Pallars"),
  D(18, "2026-11-23T11:26:31.503Z", "Desconeguda", "guardia", "Gossos Pallars"),
];
const E = (id: number, created_at: string, kind: string, detection_id: number | null, zone_norm: string | null, group_name: string): EventRow =>
  ({ id, created_at, kind, detection_id, zone_norm, group_name });
const EVENTS: EventRow[] = [
  E(1, "2026-11-22T08:18:16.719Z", "still", 14, "Sort", "Controlant"),               // "Estan de palique.."
  E(2, "2026-11-22T17:47:11.652Z", "echo", 15, "La Pobla de Segur", "Controlant"),
  E(3, "2026-11-22T17:47:12.278Z", "echo", 15, "La Pobla de Segur", "Gossos Pallars"),
  E(4, "2026-11-22T18:32:51.540Z", "ask", 15, "La Pobla de Segur", "Controlant"),      // "Encara estan?"
  E(5, "2026-11-22T18:49:00.550Z", "cleared", 15, "La Pobla de Segur", "Gossos Pallars"), // "No"
  E(6, "2026-11-23T12:23:05.700Z", "still", 18, "Desconeguda", "Controlant"),        // "Segueixen de pujada"
  E(7, "2026-11-23T11:50:58.217Z", "echo", 18, "Desconeguda", "Controlant"),
];
const at = (iso: string) => Date.parse(iso);

test("hora local de Madrid", () => {
  assert.deepEqual(localTime(at("2026-11-23T08:18:00Z")), { mod: 9 * 60 + 18, dow: 1 });
  assert.equal(localTime(at("2026-07-01T08:00:00Z")).mod, 10 * 60); // horari d'estiu
});

test("episodis: avisos propers de la mateixa zona són un sol control", () => {
  const m = buildModel(DETS, EVENTS, at("2026-11-23T13:30:00Z"));
  const sort = m.episodes.filter((e) => e.zone === "Sort");
  assert.equal(sort.length, 2);
  assert.equal(sort[1].reports, 2);
  const pobla = m.episodes.find((e) => e.zone === "La Pobla de Segur")!;
  assert.equal(Math.round((pobla.end! - pobla.start) / 60000), 62); // de l'avís al "No"
  assert.ok(pobla.groups.size >= 3);
});

test("durada mitjana raonable amb poques dades", () => {
  const m = buildModel(DETS, EVENTS, at("2026-11-23T13:30:00Z"));
  assert.ok(m.duration.global > 45 && m.duration.global < 90, `durada ${m.duration.global}`);
  assert.equal(m.duration.complete, 1);
});

test("en viu: just després de l'avís és alt i baixa amb el temps", () => {
  const p = (iso: string) => zoneProbability(buildModel(DETS, EVENTS, at(iso)), "Sort", { ...localTime(at(iso)), isNow: true });
  const a = p("2026-11-23T09:30:00Z"), b = p("2026-11-23T10:30:00Z"), c = p("2026-11-23T13:30:00Z");
  assert.ok(a.live > 0.8, `a ${a.live}`);
  assert.ok(b.live < a.live && b.live > 0.1, `b ${b.live}`);
  assert.ok(c.live < 0.01, `c ${c.live}`);
});

test("un 'ja han marxat' apaga la zona", () => {
  const m = buildModel(DETS, EVENTS, at("2026-11-22T18:55:00Z"));
  const r = zoneProbability(m, "La Pobla de Segur", { ...localTime(m.now), isNow: true });
  assert.equal(r.live, 0);
  const z = zoneProbsResponse(m).zones["La Pobla de Segur"] as { status: string };
  assert.equal(z.status, "cleared");
});

test("històric: Sort al matí feiner > Sort a la nit", () => {
  const m = buildModel(DETS, EVENTS, at("2026-11-24T06:00:00Z")); // dimarts 7:00
  const mati = probabilityResponse(m, "Sort", 9, 2);
  const nit = probabilityResponse(m, "Sort", 23, 2);
  assert.ok(mati.overall > 0.05 && mati.overall < 0.5, `matí ${mati.overall}`);
  assert.equal(nit.overall, 0);
  assert.ok(mati.mossos > 0 && mati.guardia === 0);
});

test("zones sense dades: res", () => {
  const m = buildModel(DETS, EVENTS, at("2026-11-24T06:00:00Z"));
  assert.equal(probabilityResponse(m, "Tremp", 9, 2).overall, 0);
  assert.equal(probabilityResponse(m, "Tremp", 9, 2).reliability, "cap dada");
});
