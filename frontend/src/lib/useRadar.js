import { useState, useEffect, useRef, useCallback } from "react";
import { distKm, playBark, resolveDetCoords } from "./utils";

// Finestra fixa de "recent" (minuts). Abans era un slider configurable, però es
// va treure de la UI: la possibilitat es mesura ara per percentatge, no per temps.
const WINDOW_MIN = 120; // 2h

// Hook RADAR — alerta basada en DETECCIONS REALS dins un radi.
// Una alerta es dispara quan hi ha una detecció dins `alertRadiusKm` de la teva
// posició, ocorreguda fa menys de WINDOW_MIN minuts. No s'usen probabilitats
// sintètiques. A més calcula `riskPct`: la possibilitat (0..100) que hi hagi una
// patrulla prop teu ara mateix, combinant proximitat i frescor de cada detecció.
export function useRadar(detections) {
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState(null);
  const [nearby, setNearby] = useState([]); // deteccions enriquides amb _dist i _ageMin
  const [alert, setAlert] = useState(null); // {det, dist, ageMin} | null
  const [riskPct, setRiskPct] = useState(0); // possibilitat 0..100 prop teu
  const [sound, setSound] = useState(true);
  const [alertRadiusKm, setAlertRadiusKm] = useState(() => {
    try { const v = Number(localStorage.getItem("pt_radar_radius")); return v >= 1 && v <= 20 ? v : 5; } catch { return 5; }
  });
  const windowMin = WINDOW_MIN; // exposat per a textos; ja no és editable
  const lastBark = useRef(0);
  const audioRef = useRef(null);
  const watchRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("pt_radar_radius", String(alertRadiusKm)); } catch {} }, [alertRadiusKm]);

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

    // Possibilitat (0..100): cada detecció real dins del radi suma segons com
    // de prop i de fresca és. Sense res a prop → 0%. No és sintètic.
    let score = 0;
    for (const d of enriched) {
      if (d._dist > alertRadiusKm) continue;
      const prox = 1 - d._dist / alertRadiusKm;               // 0..1 (més a prop, més)
      const fresh = Math.max(0.25, 1 - d._ageMin / WINDOW_MIN); // 0.25..1 (més recent, més)
      score += prox * fresh;
    }
    setRiskPct(Math.min(100, Math.round(score * 100)));

    const danger = enriched.find(d => d._dist <= alertRadiusKm);
    setAlert(danger ? { det: danger, dist: danger._dist, ageMin: danger._ageMin } : null);
    if (danger && sound && Date.now() - lastBark.current > 10000) {
      initAudio();
      playBark(audioRef.current);
      lastBark.current = Date.now();
    }
  }, [detections, alertRadiusKm, sound]);

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
    setActive(false); setPos(null); setNearby([]); setAlert(null); setRiskPct(0);
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
    active, pos, err, nearby, alert, riskPct, sound, toggleSound,
    alertRadiusKm, setAlertRadiusKm, windowMin,
    start, stop,
  };
}
