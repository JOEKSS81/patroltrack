import { useState, useEffect, useRef, useCallback } from "react";
import { distKm, playBark, preloadBark, resolveDetCoords } from "./utils";
import { API, MAP_ZONES } from "./constants";

// Finestra fixa de "recent" (minuts). Abans era un slider configurable, però es
// va treure de la UI: la possibilitat es mesura ara per percentatge, no per temps.
const WINDOW_MIN = 120; // 2h

// Rumb (graus 0..360, 0 = nord) d'un punt a un altre.
function bearingDeg(lat1, lng1, lat2, lng2) {
  const toR = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * toR) * Math.cos(lat2 * toR);
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lng2 - lng1) * toR);
  return (Math.atan2(y, x) / toR + 360) % 360;
}
const angleDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
export const RADIUS_CHOICES = [5, 10, 20];

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
    try {
      const raw = localStorage.getItem("pt_radar_radius");
      if (raw == null) return 10;
      const v = Number(raw);
      // Radi en 3 opcions (5/10/20 km): arrodoneix el valor antic de la barra
      return RADIUS_CHOICES.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b), 10);
    } catch { return 10; }
  });
  const [heading, setHeading] = useState(null);   // direcció de marxa (graus) o null si estàs aturat
  const [level, setLevel] = useState("calm");     // semàfor: calm | caution | danger
  const prevPosRef = useRef(null);
  const headingRef = useRef(null);
  const windowMin = WINDOW_MIN; // exposat per a textos; ja no és editable
  const lastBark = useRef(0);
  const audioRef = useRef(null);
  const watchRef = useRef(null);
  // Estat per al càlcul de la possibilitat
  const modelProbRef = useRef(0);   // probabilitat del model (0..1), última rebuda
  const probZoneRef = useRef(null); // zona del darrer fetch
  const probHourRef = useRef(-1);   // hora del darrer fetch

  useEffect(() => { try { localStorage.setItem("pt_radar_radius", String(alertRadiusKm)); } catch {} }, [alertRadiusKm]);

  // Combina model + senyal en viu i actualitza el %
  // El % que es mostra és només l'HISTÒRIC d'aquesta zona a aquesta hora (model).
  // Abans es barrejava amb la densitat dins del radi i la barra de distància el movia,
  // cosa que el feia confús. El perill "ara" el dona el semàfor (avisos reals).
  const recomputeRisk = useCallback(() => {
    setRiskPct(Math.round(Math.min(1, modelProbRef.current) * 100));
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
    preloadBark(audioRef.current);
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
      const hd = headingRef.current;
      // "Davant teu": en un con de ±50° respecte la direcció de marxa (si te'n mous)
      const ahead = hd != null && dist > 0.3 && angleDiff(bearingDeg(lat, lng, c.lat, c.lng), hd) <= 50;
      enriched.push({
        ...d, _lat: c.lat, _lng: c.lng, _exact: c.exact, _dist: dist, _ahead: ahead,
        _ageMin: Math.round((Date.now() - ts) / 60000),
      });
    }
    enriched.sort((a, b) => a._dist - b._dist);
    setNearby(enriched.slice(0, 20));

    // SEMÀFOR — basat en avisos REALS recents (2 h), no en un % abstracte:
    //  vermell: dins del radi i de fa ≤ 60 min, o davant teu dins del radi
    //  groc:    dins del radi però més antic, o davant teu fins al doble del radi,
    //           o l'històric d'aquesta zona i hora és alt (≥ 40%)
    const inR = enriched.filter(d => d._dist <= alertRadiusKm);
    let lv = "calm";
    if (inR.some(d => d._ageMin <= 60 || d._ahead)) lv = "danger";
    else if (inR.length || enriched.some(d => d._ahead && d._dist <= alertRadiusKm * 2) || modelProbRef.current >= 0.4) lv = "caution";
    setLevel(lv);


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
        const { latitude: lat, longitude: lng, accuracy: acc, heading: h, speed } = p.coords;
        // Direcció de marxa: la del GPS si et mous (> ~7 km/h); si no, la calcula
        // a partir de l'última posició quan t'has desplaçat més de 40 m.
        let hd = headingRef.current;
        if (h != null && !Number.isNaN(h) && speed != null && speed > 2) hd = h;
        else if (prevPosRef.current && distKm(prevPosRef.current.lat, prevPosRef.current.lng, lat, lng) > 0.04) {
          hd = bearingDeg(prevPosRef.current.lat, prevPosRef.current.lng, lat, lng);
        }
        if (!prevPosRef.current || distKm(prevPosRef.current.lat, prevPosRef.current.lng, lat, lng) > 0.04) prevPosRef.current = { lat, lng };
        if (speed != null && speed < 0.5) hd = null;              // aturat: sense direcció
        headingRef.current = hd; setHeading(hd);
        setErr(null);
        setPos({ lat, lng, acc });
        check(lat, lng);
      },
      (e) => {
        // Només s'atura si s'ha DENEGAT el permís. Un timeout o pèrdua de senyal
        // (túnels, valls) és temporal: s'avisa però el radar continua escoltant.
        if (e && e.code === 1) { setErr("Permet l'accés a la ubicació al navegador"); setActive(false); }
        else setErr("Senyal GPS feble… continuo buscant");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  }, [check]);

  const stop = useCallback(() => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    setActive(false); setPos(null); setNearby([]); setAlert(null); setRiskPct(0); setZoneName(null);
    setLevel("calm"); setHeading(null); headingRef.current = null; prevPosRef.current = null;
    modelProbRef.current = 0; probZoneRef.current = null; probHourRef.current = -1;
    try { localStorage.removeItem("pt_auto"); } catch {}
  }, []);

  // Botó "Prova" del lladruc (també desbloqueja l'àudio del navegador)
  const testBark = useCallback(() => { initAudio(); playBark(audioRef.current); }, []);

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
    alertRadiusKm, setAlertRadiusKm, windowMin, heading, level, testBark,
    start, stop,
  };
}
