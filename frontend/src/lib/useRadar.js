import { useState, useEffect, useRef, useCallback } from "react";
import { distKm, playBark, resolveDetCoords } from "./utils";
import { API, MAP_ZONES } from "./constants";

// Finestra fixa de "recent" (minuts). Abans era un slider configurable, però es
// va treure de la UI: la possibilitat es mesura ara per percentatge, no per temps.
const WINDOW_MIN = 120; // 2h

// Zona del mapa més propera a una posició (o null si estàs a >40km de tot punt
// conegut → no hi ha model fiable per a tu).
function nearestZone(lat, lng) {
  let best = null, bestD = Infinity;
  for (const z of MAP_ZONES) {
    const d = distKm(lat, lng, z.lat, z.lng);
    if (d < bestD) { bestD = d; best = z; }
  }
  return best && bestD <= 40 ? best : null;
}

// Hook RADAR — possibilitat de trobar un control + alerta de deteccions reals.
// `riskPct` (0..100) és la POSSIBILITAT DE TROBAR UN CONTROL on ets ara: surt del
// model predictiu històric (mateixa fórmula que la pestanya Consulta: zona + hora
// amb decaïment temporal), i puja si a més hi ha una detecció REAL dins del radi.
// L'alerta sonora (lladruc) i la llista segueixen basades en deteccions reals.
export function useRadar(detections) {
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState(null);
  const [nearby, setNearby] = useState([]); // deteccions enriquides amb _dist i _ageMin
  const [alert, setAlert] = useState(null); // {det, dist, ageMin} | null
  const [riskPct, setRiskPct] = useState(0); // possibilitat 0..100 de trobar control
  const [zoneName, setZoneName] = useState(null); // zona del model usada per al %
  const [sound, setSound] = useState(true);
  const [alertRadiusKm, setAlertRadiusKm] = useState(() => {
    try { const v = Number(localStorage.getItem("pt_radar_radius")); return v >= 1 && v <= 20 ? v : 5; } catch { return 5; }
  });
  const windowMin = WINDOW_MIN; // exposat per a textos; ja no és editable
  const lastBark = useRef(0);
  const audioRef = useRef(null);
  const watchRef = useRef(null);
  // Estat per al càlcul de la possibilitat
  const modelProbRef = useRef(0);   // probabilitat del model (0..1), última rebuda
  const liveScoreRef = useRef(0);   // contribució de deteccions reals (0..1)
  const probZoneRef = useRef(null); // zona del darrer fetch
  const probHourRef = useRef(-1);   // hora del darrer fetch

  useEffect(() => { try { localStorage.setItem("pt_radar_radius", String(alertRadiusKm)); } catch {} }, [alertRadiusKm]);

  // Combina model + senyal en viu i actualitza el %
  const recomputeRisk = useCallback(() => {
    const p = Math.max(modelProbRef.current, liveScoreRef.current);
    setRiskPct(Math.round(Math.min(1, p) * 100));
  }, []);

  // Demana al backend la probabilitat per zona+hora (model històric)
  const fetchProb = useCallback((zoneId, hour) => {
    fetch(`${API}/api/probability?zone=${encodeURIComponent(zoneId)}&hour=${hour}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        modelProbRef.current = d && typeof d.overall === "number" ? d.overall : 0;
        recomputeRisk();
      })
      .catch(() => {});
  }, [recomputeRisk]);

  const initAudio = () => {
    if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
  };

  const check = useCallback((lat, lng) => {
    const cutoff = Date.now() - WINDOW_MIN * 60 * 1000;
    const enriched = [];
    for (const d of detections) {
      const ts = d.created_at ? new Date(d.created_at).getTime() : 0;
      if (ts < cutoff) continue;
      const c = resolveDetCoords(d);
      if (!c) continue;
      const dist = Math.round(distKm(lat, lng, c.lat, c.lng) * 10) / 10;
      enriched.push({
        ...d, _lat: c.lat, _lng: c.lng, _exact: c.exact, _dist: dist,
        _ageMin: Math.round((Date.now() - ts) / 60000),
      });
    }
    enriched.sort((a, b) => a._dist - b._dist);
    setNearby(enriched.slice(0, 20));

    // Senyal EN VIU (0..1): si hi ha una detecció real dins del radi, com de prop
    // i de fresca és. Empeny el % cap amunt quan hi ha una patrulla a prop ara.
    let live = 0;
    for (const d of enriched) {
      if (d._dist > alertRadiusKm) continue;
      const prox = 1 - d._dist / alertRadiusKm;                 // 0..1 (més a prop, més)
      const fresh = Math.max(0.25, 1 - d._ageMin / WINDOW_MIN); // 0.25..1 (més recent, més)
      live = Math.max(live, prox * fresh);
    }
    liveScoreRef.current = Math.min(1, live);

    // MODEL predictiu: possibilitat de trobar un control a la teva zona, a aquesta
    // hora, segons l'històric. Només refem la consulta si canvia la zona o l'hora.
    const z = nearestZone(lat, lng);
    setZoneName(z ? (z.label || z.id) : null);
    const hour = new Date().getHours();
    if (z && (z.id !== probZoneRef.current || hour !== probHourRef.current)) {
      probZoneRef.current = z.id; probHourRef.current = hour;
      fetchProb(z.id, hour);
    } else if (!z) {
      modelProbRef.current = 0; probZoneRef.current = null;
    }
    recomputeRisk();

    const danger = enriched.find(d => d._dist <= alertRadiusKm);
    setAlert(danger ? { det: danger, dist: danger._dist, ageMin: danger._ageMin } : null);
    if (danger && sound && Date.now() - lastBark.current > 10000) {
      initAudio();
      playBark(audioRef.current);
      lastBark.current = Date.now();
    }
  }, [detections, alertRadiusKm, sound, fetchProb, recomputeRisk]);

  const start = useCallback(() => {
    initAudio();
    if (!navigator.geolocation) { setErr("GPS no disponible"); return; }
    setActive(true); setErr(null);
    try { localStorage.setItem("pt_auto", "1"); } catch {}
    watchRef.current = navigator.geolocation.watchPosition(
      p => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        check(p.coords.latitude, p.coords.longitude);
      },
      () => { setErr("Permet l'accés a la ubicació al navegador"); setActive(false); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }, [check]);

  const stop = useCallback(() => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    setActive(false); setPos(null); setNearby([]); setAlert(null); setRiskPct(0); setZoneName(null);
    modelProbRef.current = 0; liveScoreRef.current = 0; probZoneRef.current = null; probHourRef.current = -1;
    try { localStorage.removeItem("pt_auto"); } catch {}
  }, []);

  const toggleSound = useCallback(() => {
    setSound(prev => {
      const next = !prev;
      const ctx = audioRef.current;
      if (ctx) { if (next) ctx.resume().catch(() => {}); else ctx.suspend().catch(() => {}); }
      return next;
    });
  }, []);

  useEffect(() => () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); }, []);
  useEffect(() => { if (pos) check(pos.lat, pos.lng); }, [detections, check, pos]);

  return {
    active, pos, err, nearby, alert, riskPct, zoneName, sound, toggleSound,
    alertRadiusKm, setAlertRadiusKm, windowMin,
    start, stop,
  };
}
