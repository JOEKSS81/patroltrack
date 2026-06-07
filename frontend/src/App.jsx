import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import MapTab from "./MapTab";

// API URL — prioritats:
//   1) VITE_API_URL (env var de build, p.ex. https://patroltrack-api.xxx.workers.dev)
//   2) En dev (Vite a :5173) → wrangler local (http://localhost:8787) o backend FastAPI (http://localhost:8000)
//   3) Mateix origin (frontend i backend al mateix host)
const API = (
  import.meta.env.VITE_API_URL
  || (typeof window!=="undefined" && window.location.port==="5173"
        ? "http://localhost:8787"
        : "")
);

// ── SKINS / TEMES VISUALS ─────────────────────────────────────────────────
// Cada tema defineix la mateixa estructura de variables de color. La lectura
// (contrast text↔fons) està garantida en tots ells. Algun pot tenir un
// `pattern` opcional (background-image) per al fons del root.

const THEMES = {
  normal: {
    label:"Normal", emoji:"🟠",
    bg:"#0a0c10", surface:"#111318", border:"#2a3340",
    accent:"#ffb84d", accentDim:"#ffb84d2a", accentGlow:"#ffb84d66",
    mossos:"#60a5fa", guardia:"#4ade80", local:"#c084fc",
    text:"#f5f7fb", textDim:"#b8c0cc", textMuted:"#8a92a3",
    danger:"#ff5757", warning:"#ffb020", success:"#22d97a",
  },
  terror: {
    label:"Terror", emoji:"💀",
    bg:"#0a0303", surface:"#170808", border:"#3a1414",
    accent:"#dc2626", accentDim:"#dc262622", accentGlow:"#dc262677",
    mossos:"#a78bfa", guardia:"#84cc16", local:"#ec4899",
    text:"#f0e8e0", textDim:"#b8a098", textMuted:"#7a5f55",
    danger:"#ef4444", warning:"#f59e0b", success:"#84cc16",
  },
  camo: {
    label:"Camuflatge", emoji:"🪖",
    bg:"#1f2818", surface:"#2c3823", border:"#4d5e36",
    accent:"#c5d18a", accentDim:"#c5d18a22", accentGlow:"#c5d18a66",
    mossos:"#9ccc65", guardia:"#bcaaa4", local:"#d7ccc8",
    text:"#f0f2dc", textDim:"#c4c8a8", textMuted:"#929679",
    danger:"#d84747", warning:"#e8a52c", success:"#aed581",
    pattern: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='%231f2818'/><path d='M20,20 q30,-10 60,5 t60,15 q-30,20 -70,10 t-50,-30z' fill='%232c3823' opacity='0.6'/><path d='M-10,90 q40,-20 80,0 t80,10 q-30,30 -90,15 t-70,-25z' fill='%23394a23' opacity='0.5'/><ellipse cx='130' cy='130' rx='35' ry='20' fill='%23475a39' opacity='0.4'/><ellipse cx='40' cy='130' rx='25' ry='15' fill='%231a2210' opacity='0.5'/></svg>")`,
  },
  candy: {
    label:"Candy", emoji:"🍭",
    bg:"#1a0a14", surface:"#2a1528", border:"#5e3252",
    accent:"#ff5fb3", accentDim:"#ff5fb322", accentGlow:"#ff5fb377",
    mossos:"#fbb6ce", guardia:"#c4b5fd", local:"#fde68a",
    text:"#ffe4f1", textDim:"#f9a8d4", textMuted:"#b87aa0",
    danger:"#f43f5e", warning:"#fb923c", success:"#5eead4",
  },
  neon: {
    label:"Futurista", emoji:"🛸",
    bg:"#040618", surface:"#0c1230", border:"#1e2a60",
    accent:"#00f0ff", accentDim:"#00f0ff22", accentGlow:"#00f0ff88",
    mossos:"#5eaaff", guardia:"#39ff14", local:"#bf5cff",
    text:"#e0f7ff", textDim:"#7fc8e5", textMuted:"#5183a8",
    danger:"#ff2d75", warning:"#ffd60a", success:"#00ff88",
  },
  hacker: {
    label:"Hacker", emoji:"💻",
    bg:"#000000", surface:"#050a05", border:"#114411",
    accent:"#00ff41", accentDim:"#00ff4122", accentGlow:"#00ff4188",
    mossos:"#00d4ff", guardia:"#88ff00", local:"#ff8800",
    text:"#a0ffa0", textDim:"#5fbf5f", textMuted:"#3a7f3a",
    danger:"#ff3333", warning:"#ffcc00", success:"#00ff66",
  },
};

// ThemeContext — per defecte el tema normal. Cada component fa `const C = useC()`.
const ThemeContext = createContext(THEMES.normal);
const useC = () => useContext(ThemeContext);

// Compatibilitat: si algun codi referencia el `C` de module-scope (no embolcallat
// pel Provider), agafa el tema normal com a fallback.
const C = THEMES.normal;

const ZONES = [
  "N-II","C-13","C-14","C-26","C-12","C-25","C-28","A-2","N-260",
  "Lleida - Centre","Lleida - Cappont","Lleida - Balàfia","Lleida - La Bordeta",
  "Lleida - La Magdalena","Lleida - Partida Alta","Lleida - El Corregidor",
  "Mollerussa","Tàrrega","Balaguer","La Seu d'Urgell","Tremp","Cervera",
  "Les Borges Blanques","Ponts","Artesa de Segre","Sort","Vielha",
  "Pont de Suert","La Pobla de Segur","Isona","Esterri d'Àneu","Rialp",
  "Alcarràs","Alguaire","Almacelles","Guissona","Bellpuig","Organyà",
  "Oliana","Calaf","Arbeca","Rosselló","Torrefarrera","Torregrossa",
  "Seròs","Golmés","Verdú","Llavorsí","Camarasa","Menàrguens",
  "Aeroport de Lleida","Alfarràs","Almenar","Artesa de Lleida",
  "Bellcaire d'Urgell","Bell-lloc d'Urgell","Bellvís","Fondarella",
  "La Granadella","La Granja d'Escarp","Maials","Miralcamp","Palau d'Anglesola",
  "Puigverd de Lleida","Sudanell","Sunyer","Torrebesses","Torrent",
  "Vilanova de Segrià","Vila-sana","Guimerà","L'Espluga Calba","Preixana",
  "Sant Martí de Riucorb","Vilagrassa","Àger","Cubells","Os de Balaguer",
  "Santa Linya","Gerri de la Sal","Tírvia","Montblanc",
];

const PT = {
  mossos:  { label: "Mossos d'Esquadra", color: C.mossos,  short: "MSE" },
  guardia: { label: "Guardia Civil",      color: C.guardia, short: "GC"  },
  local:   { label: "Policia Local",      color: C.local,   short: "PL"  },
  unknown: { label: "Desconegut",         color: C.textDim, short: "???" },
};

const HOURS = Array.from({length:24},(_,i)=>i);
const DAYS_SHORT = ["Dg","Dl","Dt","Dc","Dj","Dv","Ds"];
const DAYS_FULL  = ["Diumenge","Dilluns","Dimarts","Dimecres","Dijous","Divendres","Dissabte"];
const MONTHS     = ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];

const MAP_ZONES = [
  { id:"N-II",            x:45, y:55, r:18, label:"N-II",     lat:41.615, lng:0.620, rKm:15 },
  { id:"C-13",            x:52, y:28, r:14, label:"C-13",     lat:41.850, lng:0.950, rKm:20 },
  { id:"C-14",            x:62, y:35, r:13, label:"C-14",     lat:41.990, lng:1.030, rKm:18 },
  { id:"C-26",            x:68, y:42, r:12, label:"C-26",     lat:41.790, lng:0.810, rKm:15 },
  { id:"A-2",             x:30, y:62, r:16, label:"A-2",      lat:41.580, lng:0.490, rKm:20 },
  { id:"Lleida - Centre", x:50, y:55, r:20, label:"Lleida",   lat:41.614, lng:0.627, rKm:8  },
  { id:"Mollerussa",      x:35, y:65, r:11, label:"Mollr.",   lat:41.625, lng:0.893, rKm:5  },
  { id:"Tàrrega",         x:25, y:72, r:10, label:"Tàrrega",  lat:41.645, lng:1.139, rKm:5  },
  { id:"Balaguer",        x:65, y:40, r:11, label:"Balaguer", lat:41.791, lng:0.811, rKm:5  },
  { id:"La Seu d'Urgell", x:72, y:18, r:10, label:"Seu U.",   lat:42.358, lng:1.457, rKm:5  },
  { id:"Tremp",           x:60, y:22, r:10, label:"Tremp",    lat:42.167, lng:0.900, rKm:5  },
  { id:"Cervera",         x:22, y:78, r:9,  label:"Cervera",  lat:41.668, lng:1.272, rKm:5  },
  { id:"Sort",            x:58, y:15, r:9,  label:"Sort",     lat:42.412, lng:1.128, rKm:5  },
  { id:"Vielha",          x:45, y:10, r:9,  label:"Vielha",   lat:42.700, lng:0.795, rKm:5  },
  { id:"Artesa de Segre", x:63, y:48, r:9,  label:"Artesa",   lat:41.899, lng:1.048, rKm:5  },
  { id:"Ponts",           x:58, y:42, r:8,  label:"Ponts",    lat:41.920, lng:1.195, rKm:5  },
];

function distKm(a1,o1,a2,o2){
  const R=6371,d1=(a2-a1)*Math.PI/180,d2=(o2-o1)*Math.PI/180;
  const a=Math.sin(d1/2)**2+Math.cos(a1*Math.PI/180)*Math.cos(a2*Math.PI/180)*Math.sin(d2/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function playBark(ctx){
  if(!ctx)return;
  const now=ctx.currentTime;
  for(let i=0;i<2;i++){
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);
    o.frequency.setValueAtTime(800,now+i*0.3);
    o.frequency.exponentialRampToValueAtTime(200,now+i*0.3+0.15);
    g.gain.setValueAtTime(0.4,now+i*0.3);
    g.gain.exponentialRampToValueAtTime(0.001,now+i*0.3+0.15);
    o.start(now+i*0.3);o.stop(now+i*0.3+0.15);
  }
}

function ProbBar({value,type}){
  const C=useC();
  const color=PT[type]?.color||C.textDim;
  const pct=Math.round((value||0)*100);
  return(
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:14,color:C.textDim}}>{PT[type]?.label}</span>
        <span style={{fontSize:15,fontWeight:700,color:pct>60?C.danger:pct>35?C.warning:C.success}}>{pct}%</span>
      </div>
      <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width 0.6s",boxShadow:`0 0 8px ${color}88`}}/>
      </div>
    </div>
  );
}

function HourlyChart({data}){
  const C=useC();
  if(!data)return null;
  const now=new Date().getHours();
  return(
    <div style={{marginTop:14}}>
      <div style={{fontSize:13,color:C.textDim,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.1em"}}>Probabilitat per hora</div>
      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:56}}>
        {HOURS.map(h=>{
          const v=data[h]||0,isNow=h===now;
          const col=v>0.6?C.danger:v>0.35?C.warning:C.success;
          return(
            <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{width:"100%",height:Math.round(v*48)+2,background:isNow?C.accent:col,borderRadius:"2px 2px 0 0",opacity:isNow?1:0.6,boxShadow:isNow?`0 0 6px ${C.accent}`:"none"}}/>
              {h%6===0&&<span style={{fontSize:10,color:C.textMuted}}>{h}h</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MapSVG({zoneData,onSelect,selected}){
  const C=useC();
  return(
    <div style={{position:"relative",width:"100%",paddingBottom:"72%",background:"#0d1117",borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:10}}>
      <svg viewBox="0 0 100 80" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
        {Array.from({length:11},(_,i)=><line key={`h${i}`} x1="0" y1={i*8} x2="100" y2={i*8} stroke="#ffffff04" strokeWidth="0.3"/>)}
        {Array.from({length:13},(_,i)=><line key={`v${i}`} x1={i*8} y1="0" x2={i*8} y2="80" stroke="#ffffff04" strokeWidth="0.3"/>)}
        <line x1="10" y1="58" x2="90" y2="52" stroke="#ffffff0a" strokeWidth="1.8"/>
        <line x1="50" y1="8"  x2="52" y2="76" stroke="#ffffff0a" strokeWidth="1.4"/>
        <line x1="45" y1="55" x2="75" y2="35" stroke="#ffffff07" strokeWidth="1.1"/>
        <line x1="28" y1="62" x2="68" y2="42" stroke="#ffffff07" strokeWidth="1.1"/>
        <line x1="52" y1="28" x2="72" y2="18" stroke="#ffffff06" strokeWidth="0.9"/>
        {MAP_ZONES.map(z=>{
          const p=zoneData[z.id]||0,isSel=selected===z.id;
          const col=p>0.6?C.danger:p>0.35?C.warning:C.success;
          const bigR=z.r*(p>0.5?1.15:1);
          return(
            <g key={z.id} onClick={()=>onSelect(z.id)} style={{cursor:"pointer"}}>
              {p>0.35&&(
                <circle cx={z.x} cy={z.y} r={bigR+5} fill="none" stroke={col} strokeWidth="0.6" opacity="0.25">
                  <animate attributeName="r" values={`${bigR+3};${bigR+9};${bigR+3}`} dur="2.5s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle cx={z.x} cy={z.y} r={bigR} fill={isSel?`${col}40`:`${col}18`} stroke={isSel?col:`${col}60`} strokeWidth={isSel?1.8:0.9}/>
              <text x={z.x} y={z.y-1.5} textAnchor="middle" dominantBaseline="middle" fill={C.text} fontSize="2.9" fontWeight="700" style={{pointerEvents:"none"}}>{z.label}</text>
              <text x={z.x} y={z.y+3.8} textAnchor="middle" dominantBaseline="middle" fill={col} fontSize="2.6" fontWeight="600" style={{pointerEvents:"none"}}>{Math.round(p*100)}%</text>
            </g>
          );
        })}
      </svg>
      <div style={{position:"absolute",bottom:6,left:8,display:"flex",gap:10,fontSize:12}}>
        {[[C.danger,">60%"],[C.warning,"35-60%"],[C.success,"<35%"]].map(([col,lbl])=>(
          <div key={lbl} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:col}}/>
            <span style={{color:C.textDim}}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hook RADAR — alerta basada en DETECCIONS REALS dins un radi i finestra de temps ──
// `detections` = llista del backend. Una alerta es dispara quan hi ha una detecció amb
// coords (reals o de zona) dins `alertRadiusKm` km de la teva posició, ocorreguda fa
// menys de `windowMin` minuts. Ja no usem probabilitats sintètiques.
function useRadar(detections){
  const [active,setActive]=useState(false);
  const [pos,setPos]=useState(null);
  const [err,setErr]=useState(null);
  const [nearby,setNearby]=useState([]);            // deteccions recents enriquides amb _dist i _ageMin
  const [alert,setAlert]=useState(null);            // {det, dist} | null
  const [sound,setSound]=useState(true);
  const [alertRadiusKm,setAlertRadiusKm]=useState(()=>{
    try{const v=Number(localStorage.getItem("pt_radar_radius"));return v>=1&&v<=20?v:5;}catch{return 5;}
  });
  const [windowMin,setWindowMin]=useState(()=>{
    try{const v=Number(localStorage.getItem("pt_radar_window"));return v>=15&&v<=240?v:60;}catch{return 60;}
  });
  const [lastBark,setLastBark]=useState(0);
  const audioRef=useRef(null);
  const watchRef=useRef(null);

  useEffect(()=>{try{localStorage.setItem("pt_radar_radius",String(alertRadiusKm));}catch{}},[alertRadiusKm]);
  useEffect(()=>{try{localStorage.setItem("pt_radar_window",String(windowMin));}catch{}},[windowMin]);

  const initAudio=()=>{if(!audioRef.current)audioRef.current=new(window.AudioContext||window.webkitAudioContext)();};

  // Resol coords per una detecció: reals si en té, si no usa la zona del mapa
  const resolveCoords=(d)=>{
    if(d.lat!=null&&d.lng!=null)return{lat:d.lat,lng:d.lng,exact:true};
    const z=MAP_ZONES.find(z=>z.id===(d.zone_norm||d.zone));
    if(z)return{lat:z.lat,lng:z.lng,exact:false};
    return null;
  };

  const check=useCallback((lat,lng)=>{
    const cutoff=Date.now()-windowMin*60*1000;
    const enriched=[];
    for(const d of detections){
      const ts=d.created_at?new Date(d.created_at).getTime():0;
      if(ts<cutoff)continue;
      const c=resolveCoords(d);
      if(!c)continue;
      const dist=Math.round(distKm(lat,lng,c.lat,c.lng)*10)/10;
      enriched.push({...d,_lat:c.lat,_lng:c.lng,_exact:c.exact,_dist:dist,_ageMin:Math.round((Date.now()-ts)/60000)});
    }
    enriched.sort((a,b)=>a._dist-b._dist);
    setNearby(enriched.slice(0,20));
    const danger=enriched.find(d=>d._dist<=alertRadiusKm);
    setAlert(danger?{det:danger,dist:danger._dist,ageMin:danger._ageMin}:null);
    if(danger&&sound&&Date.now()-lastBark>10000){initAudio();playBark(audioRef.current);setLastBark(Date.now());}
  },[detections,alertRadiusKm,windowMin,sound,lastBark]);

  const start=useCallback(()=>{
    initAudio();
    if(!navigator.geolocation){setErr("GPS no disponible");return;}
    setActive(true);setErr(null);
    try{localStorage.setItem("pt_auto","1");}catch{}
    watchRef.current=navigator.geolocation.watchPosition(
      p=>{setPos({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy});check(p.coords.latitude,p.coords.longitude);},
      ()=>{setErr("Permet l'accés a la ubicació al navegador");setActive(false);},
      {enableHighAccuracy:true,maximumAge:0,timeout:15000}
    );
  },[check]);

  const stop=useCallback(()=>{
    if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);
    setActive(false);setPos(null);setNearby([]);setAlert(null);
    try{localStorage.removeItem("pt_auto");}catch{}
  },[]);

  const toggleSound=useCallback(()=>{
    setSound(prev=>{
      const next=!prev;
      const ctx=audioRef.current;
      if(ctx){ if(next)ctx.resume().catch(()=>{}); else ctx.suspend().catch(()=>{}); }
      return next;
    });
  },[]);

  useEffect(()=>()=>{if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);},[]);
  useEffect(()=>{if(pos)check(pos.lat,pos.lng);},[detections,check,pos]);

  return {active,pos,err,nearby,alert,sound,toggleSound,alertRadiusKm,setAlertRadiusKm,windowMin,setWindowMin,start,stop};
}

// ── Splash d'auto-activació ───────────────────────────────────────────────
function Splash({onActivate,onSkip,wasActive,dogPhoto}){
  const C=useC();
  return(
    <div style={{position:"fixed",inset:0,zIndex:10000,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Mono','Courier New',monospace"}}>
      <img src={dogPhoto} alt="PatrolTrack" style={{maxWidth:"min(85vw,360px)",maxHeight:"50vh",width:"auto",height:"auto",marginBottom:20,filter:`drop-shadow(0 0 28px ${C.accent}66)`,display:"block"}}/>
      <div style={{fontSize:24,fontWeight:800,color:C.accent,marginBottom:6,letterSpacing:"0.05em"}}>PATROL<span style={{color:C.textDim}}>TRACK</span></div>
      <div style={{fontSize:15,color:C.textDim,marginBottom:32,textAlign:"center",maxWidth:320,lineHeight:1.5}}>
        {wasActive?"Toca per reactivar el radar i les alertes sonores.":"Activa el radar GPS i rebràs alertes quan t'acostis a una zona de risc."}
      </div>
      <button onClick={onActivate} autoFocus style={{width:"100%",maxWidth:340,padding:"20px 24px",background:C.success,color:"#fff",border:"none",borderRadius:12,fontSize:18,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 0 32px ${C.success}66`}}>
        ▶ ACTIVAR PROTECCIÓ
      </button>
      <button onClick={onSkip} style={{marginTop:18,background:"none",border:"none",color:C.textMuted,fontSize:13,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
        Saltar (sense alertes automàtiques)
      </button>
      <div style={{position:"absolute",bottom:24,left:0,right:0,textAlign:"center",fontSize:11,color:C.textMuted,padding:"0 24px"}}>
        Requereix permís d'ubicació i so del dispositiu
      </div>
    </div>
  );
}

// ── Pestanya RADAR (pura UI) ──────────────────────────────────────────────
function RadarTab({radar,dogPhoto="/dog.png",onDetTap}){
  const C=useC();
  const {active,pos,err,nearby,sound,toggleSound,alertRadiusKm,setAlertRadiusKm,windowMin,setWindowMin,start,stop}=radar;
  return(
    <div>
      <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:12,color:C.accent}}>🐕 Radar GPS</div>
        <button onClick={active?stop:start} style={{width:"100%",padding:14,background:active?C.danger:C.success,color:"#fff",border:"none",borderRadius:8,fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:12,boxShadow:active?`0 0 20px ${C.danger}66`:`0 0 20px ${C.success}66`}}>
          {active?"⏹ ATURAR RADAR":"▶ ACTIVAR RADAR GPS"}
        </button>
        {err&&<div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}`,borderRadius:8,padding:10,fontSize:13,color:C.danger,marginBottom:12}}>⚠ {err}</div>}
        {pos&&<div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,fontSize:13}}><div style={{color:C.textDim,marginBottom:3}}>📍 Posició actual</div><div style={{color:C.text}}>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div><div style={{color:C.textDim,marginTop:2}}>Precisió: ±{Math.round(pos.acc)}m</div></div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:14,color:C.textDim}}>🔊 Lladruc d'alerta</span>
          <div onClick={toggleSound} style={{width:44,height:24,borderRadius:12,background:sound?C.accent:C.border,position:"relative",cursor:"pointer",transition:"background 0.2s"}}>
            <div style={{position:"absolute",top:2,left:sound?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:14,color:C.textDim}}>Radi d'alerta</span><span style={{fontSize:14,color:C.accent,fontWeight:700}}>{alertRadiusKm} km</span></div>
          <input type="range" min={1} max={20} value={alertRadiusKm} onChange={e=>setAlertRadiusKm(Number(e.target.value))} style={{width:"100%",accentColor:C.accent}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.textMuted,marginTop:2}}><span>Just al costat</span><span>Comarca sencera</span></div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:14,color:C.textDim}}>Finestra recent</span><span style={{fontSize:14,color:C.accent,fontWeight:700}}>{windowMin} min</span></div>
          <input type="range" min={15} max={240} step={15} value={windowMin} onChange={e=>setWindowMin(Number(e.target.value))} style={{width:"100%",accentColor:C.accent}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.textMuted,marginTop:2}}><span>15 min</span><span>4h</span></div>
        </div>
        <div style={{fontSize:11,color:C.textMuted,marginTop:10,lineHeight:1.5}}>
          ↳ Alerta quan una <b style={{color:C.textDim}}>detecció real</b> apareix dins de <b style={{color:C.textDim}}>{alertRadiusKm} km</b> teus en els darrers <b style={{color:C.textDim}}>{windowMin} min</b>.
        </div>
      </div>
      {active&&(
        <div>
          <div style={{fontSize:13,color:C.textDim,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.1em",display:"flex",justifyContent:"space-between"}}>
            <span>Deteccions recents prop teu</span>
            <span style={{color:C.textMuted,letterSpacing:0}}>{nearby.length} en {windowMin} min</span>
          </div>
          {nearby.length===0?(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:16,textAlign:"center"}}><div style={{fontSize:14,color:C.textDim}}>Cap detecció recent a la zona ✓</div></div>
          ):nearby.slice(0,8).map((d,i)=>{
            const ptype=PT[d.patrol_type]||PT.unknown;
            const isDanger=d._dist<=alertRadiusKm;
            const time=d.created_at?new Date(d.created_at).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"}):"?";
            return(
              <div key={i} onClick={()=>onDetTap&&onDetTap(d)} style={{background:isDanger?`${C.danger}22`:C.surface,border:`1px solid ${isDanger?C.danger:C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:"10px 12px",marginBottom:6,boxShadow:isDanger?`0 0 12px ${C.danger}44`:"none",cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"1px 7px",borderRadius:3}}>{ptype.short}</span>
                  <span style={{fontSize:15,fontWeight:800,color:isDanger?C.danger:C.text}}>{d._dist} km</span>
                </div>
                <div style={{fontSize:13,color:C.text,marginBottom:3}}>{d.zone_norm||d.zone||"?"}{!d._exact&&<span style={{fontSize:11,color:C.textMuted}}> · pos. aprox.</span>}</div>
                {d.raw_message&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{d.raw_message.substring(0,60)}"</div>}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.textMuted}}>
                  <span>{isDanger?"🚨 dins del radi":"📍 fora del radi"}</span>
                  <span>fa {d._ageMin} min · {time}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!active&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:24,textAlign:"center"}}><img src={dogPhoto} alt="" style={{width:96,height:96,borderRadius:"50%",objectFit:"cover",objectPosition:"center 20%",marginBottom:12,border:`2px solid ${C.accent}55`}}/><div style={{fontSize:15,color:C.text,fontWeight:700,marginBottom:6}}>Radar de patrulles</div><div style={{fontSize:13,color:C.textDim,lineHeight:1.7}}>Activa el radar per rebre alertes automàtiques quan una detecció REAL aparegui prop teu. Et lladrarà quan hi hagi perill!</div></div>}
      <style>{`@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.02)}}`}</style>
    </div>
  );
}

// ── Pestanya ESTADÍSTIQUES (Distribució + Calendari fusionats) ────────────
function StatsTab({detections,onZoneTap,onDetTap}){
  const C=useC();
  const [view,setView]=useState("dist");          // "dist" | "cal"
  const [selDay,setSelDay]=useState(-1);          // -1 = tots
  const [selHour,setSelHour]=useState(-1);

  const filtered=detections.filter(d=>{
    const dt=d.created_at?new Date(d.created_at):null;
    if(!dt)return false;
    if(selDay>=0&&dt.getDay()!==selDay)return false;
    if(selHour>=0&&dt.getHours()!==selHour)return false;
    return true;
  });

  // Comptadors per hora
  const byHour=Array(24).fill(0);
  detections.forEach(d=>{if(d.created_at)byHour[new Date(d.created_at).getHours()]++;});
  const maxH=Math.max(...byHour,1);

  // Comptadors per dia
  const byDay=Array(7).fill(0);
  detections.forEach(d=>{if(d.created_at)byDay[new Date(d.created_at).getDay()]++;});
  const maxD=Math.max(...byDay,1);

  // Top zones
  const zoneCount={};
  detections.forEach(d=>{const z=d.zone_norm||d.zone||"?";zoneCount[z]=(zoneCount[z]||0)+1;});
  const topZones=Object.entries(zoneCount).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // Per tipus
  const typeCount={mossos:0,guardia:0,local:0,unknown:0};
  detections.forEach(d=>{typeCount[d.patrol_type]=(typeCount[d.patrol_type]||0)+1;});

  // ── Estat del calendari (només actiu si view === "cal") ─────────────────
  const today=new Date();
  const [calYear,setCalYear]=useState(today.getFullYear());
  const [calMonth,setCalMonth]=useState(today.getMonth());
  const [calDate,setCalDate]=useState(null);

  const detsByDate={};
  detections.forEach(d=>{
    if(!d.created_at)return;
    const dt=new Date(d.created_at);
    const key=`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    detsByDate[key]=(detsByDate[key]||[]);
    detsByDate[key].push(d);
  });
  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  const selKey=calDate?`${calYear}-${calMonth}-${calDate}`:null;
  const selDets=selKey?detsByDate[selKey]||[]:[];
  const prevMonth=()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);setCalDate(null);};
  const nextMonth=()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);setCalDate(null);};

  return(
    <div>
      {/* Toggle Distribució / Calendari */}
      <div style={{display:"flex",gap:6,marginBottom:10,background:C.surface,padding:4,borderRadius:10,border:`1px solid ${C.border}`}}>
        {[["dist","📊 Distribució"],["cal","📅 Calendari"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} style={{flex:1,padding:"9px 8px",borderRadius:8,border:"none",background:view===k?C.accent:"transparent",color:view===k?C.bg:C.textDim,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{l}</button>
        ))}
      </div>

      {view==="cal"&&(<>
        {/* Capçalera mes */}
        <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={prevMonth} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:6,width:32,height:32,cursor:"pointer",fontSize:18}}>‹</button>
            <span style={{fontSize:16,fontWeight:700,color:C.accent}}>{MONTHS[calMonth]} {calYear}</span>
            <button onClick={nextMonth} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:6,width:32,height:32,cursor:"pointer",fontSize:18}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
            {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:12,color:C.textDim,padding:"2px 0"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {cells.map((day,i)=>{
              if(!day)return<div key={i}/>;
              const key=`${calYear}-${calMonth}-${day}`;
              const dets=detsByDate[key]||[];
              const isToday=day===today.getDate()&&calMonth===today.getMonth()&&calYear===today.getFullYear();
              const isSel=calDate===day;
              const hasHigh=dets.some(d=>d.confidence==="alta");
              const hasMid=dets.some(d=>d.confidence==="mitja");
              const dotCol=hasHigh?C.danger:hasMid?C.warning:C.success;
              return(
                <div key={i} onClick={()=>setCalDate(isSel?null:day)} style={{
                  textAlign:"center",padding:"6px 2px",borderRadius:6,cursor:"pointer",
                  background:isSel?C.accentDim:isToday?`${C.accent}15`:"transparent",
                  border:`1px solid ${isSel?C.accent:isToday?`${C.accent}44`:C.border}`,
                  position:"relative",
                }}>
                  <span style={{fontSize:15,color:isToday?C.accent:isSel?C.accent:C.text,fontWeight:isToday||isSel?700:400}}>{day}</span>
                  {dets.length>0&&(
                    <div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",display:"flex",gap:1}}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:dotCol}}/>
                      {dets.length>1&&<div style={{width:5,height:5,borderRadius:"50%",background:dotCol,opacity:0.6}}/>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {calDate&&(()=>{
          // Mini-resum del dia: per tipus + per hora
          const byTypeDay={mossos:0,guardia:0,local:0,unknown:0};
          selDets.forEach(d=>{byTypeDay[d.patrol_type]=(byTypeDay[d.patrol_type]||0)+1;});
          const byHourDay=Array(24).fill(0);
          selDets.forEach(d=>{if(d.created_at)byHourDay[new Date(d.created_at).getHours()]++;});
          const maxHDay=Math.max(...byHourDay,1);
          const topZonesDay={};
          selDets.forEach(d=>{const z=d.zone_norm||d.zone||"?";topZonesDay[z]=(topZonesDay[z]||0)+1;});
          const topZonesArr=Object.entries(topZonesDay).sort((a,b)=>b[1]-a[1]).slice(0,3);
          const dayLabel=`${calDate} de ${MONTHS[calMonth]}`;
          return(
          <div>
            {selDets.length===0?(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:16,textAlign:"center"}}>
                <div style={{fontSize:14,color:C.textDim}}>Cap detecció el {dayLabel}</div>
                <div style={{fontSize:13,color:C.success,marginTop:4}}>Dia tranquil ✓</div>
              </div>
            ):(<>
              {/* Resum del dia */}
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
                  <span style={{fontSize:14,fontWeight:700,color:C.accent}}>📅 {dayLabel}</span>
                  <span style={{fontSize:13,color:C.text,fontWeight:700}}>{selDets.length} {selDets.length===1?"detecció":"deteccions"}</span>
                </div>

                {/* Per tipus */}
                <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                  {Object.entries(byTypeDay).filter(([,n])=>n>0).map(([t,n])=>{
                    const pt=PT[t]||PT.unknown;
                    return(<div key={t} style={{background:`${pt.color}22`,color:pt.color,padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>{pt.short} · {n}</div>);
                  })}
                </div>

                {/* Mini gràfic per hora */}
                <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Distribució per hora</div>
                <div style={{display:"flex",gap:2,alignItems:"flex-end",height:42,background:C.bg,padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`,marginBottom:10}}>
                  {byHourDay.map((n,h)=>{
                    const v=n/maxHDay;
                    const col=v>0.66?C.danger:v>0.33?C.warning:C.success;
                    return(<div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1,position:"relative"}}>
                      <div title={n>0?`${h}h: ${n}`:`${h}h`} style={{width:"100%",height:Math.round(v*32)+2,background:n>0?col:C.border,opacity:n>0?0.85:0.25,borderRadius:"2px 2px 0 0"}}/>
                      {h%6===0&&<span style={{fontSize:8,color:C.textMuted}}>{h}</span>}
                    </div>);
                  })}
                </div>

                {/* Top zones del dia */}
                {topZonesArr.length>0&&(<>
                  <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Zones del dia</div>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {topZonesArr.map(([z,n])=>(
                      <div key={z} onClick={()=>onZoneTap&&onZoneTap(z)} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13,cursor:"pointer"}}>
                        <span style={{color:C.text}}>{z}</span>
                        <span style={{color:C.accent,fontWeight:700}}>{n}</span>
                      </div>
                    ))}
                  </div>
                </>)}
              </div>

              {/* Llista de deteccions clicables */}
              <div style={{fontSize:11,color:C.textMuted,marginBottom:6,textAlign:"right"}}>Toca una detecció per veure el detall complet</div>
              {selDets.map((d,i)=>{
                const ptype=PT[d.patrol_type]||PT.unknown;
                const time=d.created_at?new Date(d.created_at).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"}):"??";
                return(
                  <div key={i} onClick={()=>onDetTap&&onDetTap(d)} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:12,marginBottom:8,cursor:"pointer",transition:"background .15s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:12,color:ptype.color,background:`${ptype.color}22`,padding:"2px 7px",borderRadius:3}}>{ptype.label}</span>
                      <span style={{fontSize:14,color:C.accent,fontWeight:700}}>{time}</span>
                    </div>
                    <div style={{fontSize:14,color:C.text,marginBottom:4}}>{d.zone_norm||d.zone}</div>
                    {d.raw_message&&<div style={{fontSize:13,color:C.textDim,fontStyle:"italic",marginBottom:6}}>"{d.raw_message.substring(0,65)}"</div>}
                    <div style={{display:"flex",gap:8}}>
                      <span style={{fontSize:12,color:C.textMuted,background:C.border,padding:"2px 6px",borderRadius:3}}>via {d.source?.toUpperCase()}</span>
                      <span style={{fontSize:12,color:d.confidence==="alta"?C.success:d.confidence==="mitja"?C.warning:C.textMuted,background:C.border,padding:"2px 6px",borderRadius:3}}>conf. {d.confidence}</span>
                    </div>
                  </div>
                );
              })}
            </>)}
          </div>
          );
        })()}
      </>)}

      {view==="dist"&&(<>
      {/* Gràfic per hora */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:10}}>Deteccions per hora</div>
        <div style={{display:"flex",gap:2,alignItems:"flex-end",height:64}}>
          {byHour.map((n,h)=>{
            const isSel=selHour===h,isNow=h===new Date().getHours();
            const col=isNow?C.accent:isSel?C.accent:C.mossos;
            return(
              <div key={h} onClick={()=>setSelHour(selHour===h?-1:h)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer"}}>
                <div style={{width:"100%",height:Math.round((n/maxH)*58)+2,background:col,borderRadius:"2px 2px 0 0",opacity:isSel||isNow?1:0.55,boxShadow:isSel?`0 0 6px ${C.accent}`:"none",transition:"height 0.4s"}}/>
                {h%6===0&&<span style={{fontSize:10,color:C.textMuted}}>{h}h</span>}
              </div>
            );
          })}
        </div>
        {selHour>=0&&<div style={{fontSize:12,color:C.accent,marginTop:6,textAlign:"center"}}>Filtrant per {selHour}:00h · {byHour[selHour]} deteccions — Toca per treure el filtre</div>}
      </div>

      {/* Gràfic per dia */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:10}}>Deteccions per dia de la setmana</div>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:64}}>
          {byDay.map((n,d)=>{
            const isSel=selDay===d,isToday=d===new Date().getDay();
            const col=isToday?C.accent:isSel?C.accent:C.guardia;
            return(
              <div key={d} onClick={()=>setSelDay(selDay===d?-1:d)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"}}>
                <div style={{width:"100%",height:Math.round((n/maxD)*52)+2,background:col,borderRadius:"2px 2px 0 0",opacity:isSel||isToday?1:0.55,boxShadow:isSel?`0 0 6px ${C.accent}`:"none",transition:"height 0.4s"}}/>
                <span style={{fontSize:11,color:isSel?C.accent:C.textDim}}>{DAYS_SHORT[d]}</span>
              </div>
            );
          })}
        </div>
        {selDay>=0&&<div style={{fontSize:12,color:C.accent,marginTop:6,textAlign:"center"}}>Filtrant per {DAYS_FULL[selDay]} · {byDay[selDay]} deteccions — Toca per treure el filtre</div>}
      </div>

      {/* Top zones — clicables per obrir el detall */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.accent}}>Zones més actives</div>
          <div style={{fontSize:10,color:C.textMuted}}>toca per veure detall</div>
        </div>
        {topZones.length===0?<div style={{fontSize:13,color:C.textDim,textAlign:"center"}}>Sense dades</div>:
        topZones.map(([zone,count],i)=>(
          <div key={i} onClick={()=>onZoneTap&&onZoneTap(zone)} style={{marginBottom:8,padding:"6px 8px",margin:"0 -8px 4px",borderRadius:6,cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:14,color:C.text}}>{zone}</span><span style={{fontSize:14,fontWeight:700,color:C.accent}}>{count}</span></div>
            <div style={{height:5,background:C.border,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(count/topZones[0][1])*100}%`,background:C.accent,borderRadius:3}}/></div>
          </div>
        ))}
      </div>

      {/* Per tipus */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:10}}>Per tipus de patrulla</div>
        {Object.entries(typeCount).filter(([,n])=>n>0).map(([type,n])=>(
          <div key={type} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:PT[type]?.color||C.textDim}}>{PT[type]?.label||type}</span>
            <span style={{fontSize:14,fontWeight:700,color:C.text}}>{n}</span>
          </div>
        ))}
      </div>

      {/* Deteccions filtrades */}
      {(selDay>=0||selHour>=0)&&(
        <div>
          <div style={{fontSize:13,color:C.textDim,marginBottom:8}}>Deteccions filtrades ({filtered.length})</div>
          {filtered.slice(0,10).map((d,i)=>{
            const ptype=PT[d.patrol_type]||PT.unknown;
            const time=d.created_at?new Date(d.created_at).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"??";
            return(
              <div key={i} style={{background:C.bg,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:"8px 10px",marginBottom:4}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:ptype.color}}>[{ptype.short}] {d.zone_norm||d.zone}</span><span style={{fontSize:12,color:C.accent}}>{time}</span></div>
                {d.raw_message&&<div style={{fontSize:12,color:C.textDim,fontStyle:"italic"}}>"{d.raw_message.substring(0,50)}"</div>}
              </div>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [detections,setDetections]=useState([]);
  const [health,setHealth]=useState(null);
  const [selectedZone,setSelectedZone]=useState("N-II");
  const [queryZone,setQueryZone]=useState("N-II");
  const [queryHour,setQueryHour]=useState(new Date().getHours());
  const [queryDay,setQueryDay]=useState(new Date().getDay());
  const [queryPK,setQueryPK]=useState("");
  const [queryResult,setQueryResult]=useState(null);
  const [sources,setSources]=useState({telegram:true,whatsapp:true});
  const [hourlyData,setHourlyData]=useState({});
  const [zoneProbs,setZoneProbs]=useState({});
  const [filterType,setFilterType]=useState("all");
  const [newAlert,setNewAlert]=useState(null);
  const [online,setOnline]=useState(true);
  const [lastSync,setLastSync]=useState(null);
  const prevCount=useRef(0);

  // Tema / skin actiu
  const [themeName,setThemeName]=useState(()=>{
    try{return localStorage.getItem("pt_theme")||"normal";}catch{return "normal";}
  });
  useEffect(()=>{try{localStorage.setItem("pt_theme",themeName);}catch{}},[themeName]);
  const currentTheme = THEMES[themeName] || THEMES.normal;
  // C local: dins App podem usar directament el tema actual (no cal useC perquè
  // App és qui munta el Provider).
  const C = currentTheme;

  const radar=useRadar(detections);
  const wasActive=typeof window!=="undefined"&&(()=>{try{return localStorage.getItem("pt_auto")==="1";}catch{return false;}})();
  const [showSplash,setShowSplash]=useState(true);

  // Token API + report manual ----------------------------------------------
  const [apiToken,setApiTokenRaw]=useState(()=>{
    try{return localStorage.getItem("pt_token")||"";}catch{return "";}
  });
  const setApiToken=(t)=>{
    setApiTokenRaw(t);
    try{ if(t) localStorage.setItem("pt_token",t); else localStorage.removeItem("pt_token"); }catch{}
  };

  // Telegram bot username ---------------------------------------------------
  const [botUsername,setBotUsernameRaw]=useState(()=>{
    try{return localStorage.getItem("pt_bot")||"Patrol_trackBot";}catch{return "Patrol_trackBot";}
  });
  const setBotUsername=(b)=>{
    const clean=(b||"").replace(/^@/,"").trim();
    setBotUsernameRaw(clean);
    try{ if(clean) localStorage.setItem("pt_bot",clean); else localStorage.removeItem("pt_bot"); }catch{}
  };
  const addGroupUrl = botUsername ? `https://t.me/${botUsername}?startgroup=true` : "";
  const shareAppUrl = typeof window!=="undefined" ? window.location.origin : "https://patroltrack.pages.dev";

  // Foto del gos — hardcoded a /dog.png (sempre present, no personalitzable)
  const dogPhoto = "/dog.png";

  // Estat per al modal de detall del historial -------------------------------
  const [selectedDet,setSelectedDet]=useState(null);

  const [showReport,setShowReport]=useState(false);
  const [reportMsg,setReportMsg]=useState("");
  const [reportGroup,setReportGroup]=useState("");
  const [reporting,setReporting]=useState(false);
  const [reportResult,setReportResult]=useState(null);

  const sendReport=async()=>{
    if(!apiToken){setReportResult({ok:false,reason:"Configura el token a la pestanya Configuració primer"});return;}
    if(!reportMsg.trim()){setReportResult({ok:false,reason:"Escriu o enganxa un missatge"});return;}
    setReporting(true);setReportResult(null);
    try{
      const r=await fetch(`${API}/api/ingest`,{
        method:"POST",
        headers:{"content-type":"application/json","x-ingest-token":apiToken},
        body:JSON.stringify({message:reportMsg.trim(),group_name:reportGroup.trim()||"Report manual",source:"manual"}),
      });
      const data=await r.json().catch(()=>({ok:false,reason:"Resposta invàlida"}));
      if(!r.ok){setReportResult({ok:false,reason:data?.reason||`HTTP ${r.status}`});}
      else{
        setReportResult(data);
        if(data.ok&&data.stored){
          setReportMsg("");setReportGroup("");
          // refresca la llista de deteccions després d'un moment
          setTimeout(()=>{setShowReport(false);setReportResult(null);},2200);
        }
      }
    }catch(e){setReportResult({ok:false,reason:e.message||"Error de xarxa"});}
    finally{setReporting(false);}
  };

  const getHourly=(zone)=>{
    const seed=zone.charCodeAt(0),d={};
    HOURS.forEach(h=>{const b=((seed*h)%100)/200,r=(h>=7&&h<=9)||(h>=17&&h<=20)?0.25:0,n=h>=1&&h<=5?-0.2:0;d[h]=Math.max(0,Math.min(1,b+r+n));});
    return d;
  };

  const getZoneP=()=>{
    const p={};
    MAP_ZONES.forEach(z=>{const s=z.id.charCodeAt(0),h=new Date().getHours(),b=((s*h)%100)/200,r=(h>=7&&h<=9)||(h>=17&&h<=20)?0.25:0;p[z.id]=Math.max(0,Math.min(1,b+r+Math.random()*0.1));});
    return p;
  };

  // Restaura el caché local immediatament: l'app mostra dades encara que el
  // backend trigui o estigui apagat.
  useEffect(()=>{
    try{
      const cd=localStorage.getItem("pt_detections");
      if(cd){const arr=JSON.parse(cd);if(Array.isArray(arr)){setDetections(arr);prevCount.current=arr.length;}}
      const ch=localStorage.getItem("pt_health");if(ch)setHealth(JSON.parse(ch));
      const ls=localStorage.getItem("pt_lastSync");if(ls)setLastSync(Number(ls));
    }catch{}
  },[]);

  // Ref al fetch2 perquè el puguem cridar des de visibility/focus listeners sense recrear-lo
  const fetchRef=useRef(null);
  const aliveRef=useRef(true);

  useEffect(()=>{
    aliveRef.current=true;
    const fetch2=async()=>{
      let ok=false;
      try{
        const[hr,dr]=await Promise.all([
          fetch(`${API}/api/health`,{cache:"no-store"}).catch(()=>null),
          fetch(`${API}/api/detections?limit=500`,{cache:"no-store"}).catch(()=>null),
        ]);
        const h=hr&&hr.ok?await hr.json().catch(()=>null):null;
        const d=dr&&dr.ok?await dr.json().catch(()=>null):null;
        if(!aliveRef.current)return;
        if(h){setHealth(h);try{localStorage.setItem("pt_health",JSON.stringify(h));}catch{}; ok=true;}
        if(Array.isArray(d)){
          if(d.length>prevCount.current&&prevCount.current>0){setNewAlert(d[0]);setTimeout(()=>{if(aliveRef.current)setNewAlert(null);},4000);}
          prevCount.current=d.length;
          setDetections(d);
          try{localStorage.setItem("pt_detections",JSON.stringify(d));}catch{}
          const p={...getZoneP()};
          d.forEach(det=>{if(det.zone_norm&&p[det.zone_norm]!==undefined)p[det.zone_norm]=Math.min(1,(p[det.zone_norm]||0)+0.15);});
          setZoneProbs(p);
          ok=true;
        }
      }catch{/* deixa l'estat anterior intacte */}
      if(aliveRef.current){
        setOnline(ok);
        if(ok){const t=Date.now();setLastSync(t);try{localStorage.setItem("pt_lastSync",String(t));}catch{}}
      }
    };
    fetchRef.current=fetch2;
    fetch2();
    if(Object.keys(zoneProbs).length===0)setZoneProbs(getZoneP());
    const t=setInterval(fetch2,15000);
    return()=>{aliveRef.current=false;clearInterval(t);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Refresc immediat en tornar a obrir l'app (visibility) o focus de la finestra.
  // setInterval queda pausat al mòbil quan l'app va a background → això resol "no s'actualitza".
  useEffect(()=>{
    const refresh=()=>{
      if(document.visibilityState==="visible" && fetchRef.current){
        fetchRef.current();
      }
    };
    const onFocus=()=>{ if(fetchRef.current) fetchRef.current(); };
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("focus",onFocus);
    return()=>{
      document.removeEventListener("visibilitychange",refresh);
      window.removeEventListener("focus",onFocus);
    };
  },[]);

  useEffect(()=>{setHourlyData(getHourly(selectedZone));},[selectedZone]);

  // Estat: grup seleccionat per veure detall + zona seleccionada per detall
  const [selectedGroup,setSelectedGroup]=useState(null);
  const [zoneDetail,setZoneDetail]=useState(null);
  const [deletingGroup,setDeletingGroup]=useState(null); // estat de "carregant" durant DELETE
  const [refreshTick,setRefreshTick]=useState(0); // per forçar re-fetch immediat

  // Agregació de grups derivada de les deteccions actuals (memoritzada implícitament)
  const groupsAggregate = (()=>{
    const map = {};
    for(const d of detections){
      const g = d.group_name && d.group_name.trim() ? d.group_name : "(sense grup)";
      if(!map[g]) map[g] = {name:g, count:0, latest:null, sources:new Set(), detections:[]};
      const entry = map[g];
      entry.count++;
      entry.sources.add(d.source||"unknown");
      entry.detections.push(d);
      if(!entry.latest || (d.created_at && d.created_at > entry.latest)) entry.latest = d.created_at;
    }
    return Object.values(map).sort((a,b)=>(b.latest||"").localeCompare(a.latest||""));
  })();

  const deleteGroupDetections = async (groupName) => {
    if(!apiToken){ alert("Configura el token API a Config primer."); return; }
    if(!confirm(`Esborrar TOTES les deteccions del grup "${groupName}"?\n\nNo s'esborra el bot del grup — això s'ha de fer manualment des de Telegram.`)) return;
    setDeletingGroup(groupName);
    try{
      const r = await fetch(`${API}/api/detections/delete-by-group`, {
        method:"POST",
        headers:{"content-type":"application/json","x-ingest-token":apiToken},
        body:JSON.stringify({group_name:groupName}),
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok || !data.ok){
        alert(`Error: ${data.reason || `HTTP ${r.status}`}`);
      } else {
        alert(`✓ Esborrades ${data.deleted} deteccions del grup.`);
        setSelectedGroup(null);
        // Forcem refresc de la llista
        setRefreshTick(t=>t+1);
      }
    }catch(e){ alert(`Error de xarxa: ${e.message}`); }
    finally{ setDeletingGroup(null); }
  };

  // Re-fetch quan refreshTick canvia (després d'una eliminació)
  useEffect(()=>{
    if(refreshTick===0)return;
    let alive=true;
    fetch(`${API}/api/detections?limit=500`,{cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(alive && Array.isArray(d)){
          setDetections(d);
          try{localStorage.setItem("pt_detections",JSON.stringify(d));}catch{}
          prevCount.current=d.length;
        }
      }).catch(()=>{});
    return()=>{alive=false;};
  },[refreshTick]);

  const [querying,setQuerying]=useState(false);
  const handleQuery=async()=>{
    setQuerying(true);
    setQueryResult(null);
    try{
      const r=await fetch(`${API}/api/probability?zone=${encodeURIComponent(queryZone)}&hour=${queryHour}`);
      if(!r.ok)throw new Error("Servidor: HTTP "+r.status);
      const data=await r.json();
      if(typeof data.overall!=="number")throw new Error("Resposta invàlida del servidor");
      setQueryResult({...data,pk:queryPK,day:queryDay,error:null});
    }catch(e){
      setQueryResult({mossos:0,guardia:0,local:0,overall:0,sample_size:0,reliability:"cap dada",pk:queryPK,day:queryDay,error:e.message||"No s'ha pogut connectar al backend"});
    }finally{setQuerying(false);}
  };

  const curH=new Date().getHours();
  const curP=zoneProbs[selectedZone]||(hourlyData[curH]||0);
  const filtDets=filterType==="all"?detections:detections.filter(d=>d.patrol_type===filterType);

  const tabs=[
    {id:"dashboard",label:"Inici"},
    {id:"osm",      label:"Mapa"},
    {id:"radar",    label:"Radar"},
    {id:"query",    label:"Consulta"},
    {id:"stats",    label:"Stats"},
    {id:"history",  label:"Historial"},
    {id:"config",   label:"Config"},
  ];

  // Icones modernes SVG (Feather Icons, MIT). No escalades per l'OS.
  const TabIcon = ({id,color,size=22}) => {
    const props={width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:color,strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};
    switch(id){
      case "osm":       return(<svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>);
      case "dashboard": return(<svg {...props}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>);
      case "radar":     return(<svg {...props}><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg>);
      case "query":     return(<svg {...props}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>);
      case "stats":     return(<svg {...props}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>);
      case "calendar":  return(<svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
      case "history":   return(<svg {...props}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill={color} stroke="none"/><circle cx="4" cy="12" r="1.5" fill={color} stroke="none"/><circle cx="4" cy="18" r="1.5" fill={color} stroke="none"/></svg>);
      case "config":    return(<svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
      default:          return null;
    }
  };

  const ss={width:"100%",padding:"10px 12px",background:C.bg,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,fontSize:15,fontFamily:"inherit",outline:"none"};

  return(
    <ThemeContext.Provider value={currentTheme}>
    <div style={{
      minHeight:"100vh",
      background:C.bg,
      backgroundImage:currentTheme.pattern||"none",
      backgroundSize:currentTheme.pattern?"160px 160px":undefined,
      color:C.text,
      fontFamily:"'DM Mono','Courier New',monospace",
      display:"flex",flexDirection:"column",
      transition:"background-color 0.3s ease",
    }}>
      {showSplash&&<Splash wasActive={wasActive} dogPhoto={dogPhoto} onActivate={()=>{radar.start();setShowSplash(false);}} onSkip={()=>setShowSplash(false)}/>}
      <style>{`@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.02)}}`}</style>

      {/* Header — la foto del gos al centre, mida moderada perquè la resta respiri */}
      {(()=>{
        const HEADER_H=110; // alçada total del header (compacta)
        const DOG_H=Math.round(HEADER_H*0.85); // foto = ~93px d'alt
        return(
          <div style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,height:HEADER_H,boxSizing:"border-box"}}>
            <div style={{flex:"0 1 auto",minWidth:0,maxWidth:"28%"}}>
              <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:C.accent,boxShadow:`0 0 6px ${C.accent}`,flexShrink:0}}/>
                <span style={{fontSize:14,fontWeight:700,letterSpacing:"0.02em",color:C.accent}}>PATROL<span style={{color:C.textDim}}>TRACK</span></span>
              </div>
              <div style={{fontSize:10,color:C.textDim,marginTop:2}}>Lleida · BETA</div>
              <div style={{fontSize:10,color:C.textMuted,marginTop:6,lineHeight:1.4}}>
                <div style={{color:online?C.success:C.danger,display:"flex",alignItems:"center",gap:3}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:online?C.success:C.danger,boxShadow:`0 0 4px ${online?C.success:C.danger}`}}/>
                  {online?"En línia":"Offline"}
                </div>
                <div>{health?`${health.total} dets`:(detections.length?`${detections.length} dets`:"—")}</div>
                {health&&<div>24h: {health.last_24h}</div>}
              </div>
            </div>

            {/* Foto del gos — gegant, centrada, ample que la foto natural */}
            <div style={{flex:"1 1 auto",display:"flex",justifyContent:"center",alignItems:"center",height:"100%",minWidth:0}}>
              <img
                src={dogPhoto}
                alt="PatrolTrack"
                style={{
                  height:DOG_H,
                  maxWidth:"100%",
                  width:"auto",
                  objectFit:"contain",
                  objectPosition:"center",
                  filter:`drop-shadow(0 0 14px ${C.accent}99)`,
                  display:"block",
                }}
              />
            </div>

            <div style={{flex:"0 1 auto",textAlign:"right",flexShrink:0,maxWidth:"22%"}}>
              <div style={{fontSize:16,fontWeight:700,whiteSpace:"nowrap"}}>{new Date().toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"})}</div>
              <div style={{fontSize:10,color:C.textDim,whiteSpace:"nowrap"}}>{new Date().toLocaleDateString("ca-ES",{weekday:"short",day:"numeric",month:"short"})}</div>
              {!online&&lastSync&&<div style={{fontSize:9,color:C.warning,whiteSpace:"nowrap",marginTop:2}}>últim: {new Date(lastSync).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"})}</div>}
            </div>
          </div>
        );
      })()}

      <div style={{flex:1,padding:"12px 12px 140px",overflowY:"auto",position:"relative"}}>

        {/* Avisos sticky integrats sota el header (no fixed → no tapen el gos) */}
        {(radar.alert||newAlert)&&(
          <div style={{position:"sticky",top:-2,zIndex:50,marginBottom:12,display:"flex",flexDirection:"column",gap:6}}>
            {radar.alert&&(()=>{
              const d=radar.alert.det;
              const ptype=PT[d.patrol_type]||PT.unknown;
              return(
                <div onClick={()=>setSelectedDet(d)} style={{background:C.danger,color:"#fff",padding:"10px 14px",borderRadius:10,boxShadow:`0 4px 18px ${C.danger}66, 0 0 0 1px ${C.danger}`,animation:"pulse 0.6s infinite alternate",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer"}}>
                  <span style={{fontSize:13,fontWeight:900,letterSpacing:"0.05em"}}>🚨 PATRULLA PROPERA</span>
                  <span style={{fontSize:12,fontWeight:700,opacity:0.95}}>{ptype.short} · {d.zone_norm||d.zone||"?"} · {radar.alert.dist} km · fa {radar.alert.ageMin} min</span>
                </div>
              );
            })()}
            {newAlert&&(
              <div onClick={()=>setSelectedDet(newAlert)} style={{background:`${C.danger}ee`,color:"#fff",padding:"10px 14px",borderRadius:10,boxShadow:`0 4px 14px ${C.danger}55, 0 0 0 1px ${C.danger}88`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer"}}>
                <span style={{fontSize:13,fontWeight:700}}>🔔 NOVA · {PT[newAlert.patrol_type]?.short} · {newAlert.zone_norm}</span>
                <span style={{fontSize:11,opacity:0.85}}>{newAlert.source?.toUpperCase()}</span>
              </div>
            )}
          </div>
        )}


        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <MapSVG zoneData={zoneProbs} onSelect={setSelectedZone} selected={selectedZone}/>
            <div onClick={()=>setZoneDetail(selectedZone)} style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10,cursor:"pointer",position:"relative"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700}}>{selectedZone}</div>
                  <div style={{fontSize:13,color:C.textDim,marginTop:2}}>Ara · {curH}:00h · <span style={{color:C.accent}}>toca per detall</span></div>
                </div>
                <div style={{fontSize:22,fontWeight:800,color:curP>0.6?C.danger:curP>0.35?C.warning:C.success}}>{Math.round(curP*100)}%</div>
              </div>
              <ProbBar value={curP*0.7} type="mossos"/>
              <ProbBar value={curP*0.4} type="guardia"/>
              <ProbBar value={curP*0.2} type="local"/>
              <HourlyChart data={hourlyData}/>
            </div>
            <div style={{fontSize:13,color:C.textDim,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.1em"}}>Últimes deteccions</div>
            {detections.length===0?(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:20,textAlign:"center"}}>
                <div style={{fontSize:14,color:C.textDim}}>Sense deteccions encara</div>
                <div style={{fontSize:12,color:C.textMuted,marginTop:6,lineHeight:1.5}}>Reenvia un missatge al bot @{botUsername} de Telegram o usa el botó <b style={{color:C.accent}}>+</b></div>
              </div>
            ):detections.slice(0,4).map((d,i)=>{
              const ptype=PT[d.patrol_type]||PT.unknown;
              const time=d.created_at?new Date(d.created_at).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"}):"??:??";
              return(
                <div key={i} onClick={()=>setSelectedZone(d.zone_norm)} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"1px 6px",borderRadius:3}}>{ptype.short}</span>
                      <span style={{fontSize:13,color:C.textDim}}>{d.zone_norm||d.zone}</span>
                    </div>
                    <span style={{fontSize:13,color:C.accent}}>{time}</span>
                  </div>
                  {d.raw_message&&<div style={{fontSize:13,color:C.textDim,fontStyle:"italic"}}>"{d.raw_message.substring(0,55)}"</div>}
                </div>
              );
            })}
          </div>
        )}

        {tab==="osm"&&(
          <div style={{height:"calc(100dvh - 280px)",minHeight:380,maxHeight:"calc(100vh - 220px)"}}>
            <MapTab
              zones={MAP_ZONES}
              probs={zoneProbs}
              selected={selectedZone}
              onSelect={setSelectedZone}
              theme={currentTheme}
              themeName={themeName}
              detections={detections}
              radarPos={radar.active?radar.pos:null}
            />
          </div>
        )}

        {tab==="radar"&&<RadarTab radar={radar} dogPhoto={dogPhoto} onDetTap={(d)=>setSelectedDet(d)}/>}
        {tab==="stats"&&<StatsTab detections={detections} onZoneTap={(z)=>setZoneDetail(z)} onDetTap={(d)=>setSelectedDet(d)}/>}

        {/* QUERY */}
        {tab==="query"&&(
          <div>
            <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:14,color:C.accent}}>Consulta de probabilitat</div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:13,color:C.textDim,display:"block",marginBottom:5}}>Zona / Municipi</label>
                <select value={queryZone} onChange={e=>setQueryZone(e.target.value)} style={ss}>{ZONES.map(z=><option key={z} value={z}>{z}</option>)}</select>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:13,color:C.textDim,display:"block",marginBottom:5}}>Punt Quilomètric (opcional)</label>
                <input type="text" value={queryPK} onChange={e=>setQueryPK(e.target.value)} placeholder="ex: km 45" style={{...ss,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:13,color:C.textDim,display:"block",marginBottom:5}}>Dia de la setmana</label>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {DAYS_FULL.map((day,i)=>(
                    <button key={i} onClick={()=>setQueryDay(i)} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${queryDay===i?C.accent:C.border}`,background:queryDay===i?C.accentDim:"transparent",color:queryDay===i?C.accent:C.textDim,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      {day.substring(0,3)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:13,color:C.textDim,display:"block",marginBottom:5}}>Hora — {queryHour}:00h</label>
                <input type="range" min={0} max={23} value={queryHour} onChange={e=>setQueryHour(Number(e.target.value))} style={{width:"100%",accentColor:C.accent}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.textMuted,marginTop:3}}><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
              </div>
              <button onClick={handleQuery} disabled={querying} style={{width:"100%",padding:12,background:querying?C.border:C.accent,color:querying?C.textDim:"#000",border:"none",borderRadius:8,fontSize:16,fontWeight:800,cursor:querying?"wait":"pointer",fontFamily:"inherit",opacity:querying?0.7:1}}>{querying?"CONSULTANT…":"CONSULTAR"}</button>
            </div>
            {queryResult&&(
              <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
                {queryResult.error&&(
                  <div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}`,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.danger}}>⚠ {queryResult.error}</div>
                )}
                {!queryResult.error&&queryResult.sample_size===0&&(
                  <div style={{background:`${C.warning}22`,border:`1px solid ${C.warning}`,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.warning}}>📭 Encara no hi ha registres per a aquesta zona/hora. Cal que arribin més deteccions a la base de dades.</div>
                )}
                <div style={{textAlign:"center",marginBottom:14}}>
                  <div style={{fontSize:13,color:C.textDim,marginBottom:4}}>{queryZone}{queryResult.pk?` · ${queryResult.pk}`:""} · {DAYS_FULL[queryResult.day]} · {queryHour}:00h</div>
                  <div style={{fontSize:64,fontWeight:900,lineHeight:1,color:(queryResult.overall||0)>0.6?C.danger:(queryResult.overall||0)>0.35?C.warning:C.success,textShadow:"0 0 30px currentColor"}}>{Math.round((queryResult.overall||0)*100)}%</div>
                  <div style={{fontSize:14,color:C.textDim,marginTop:4}}>probabilitat de patrulla</div>
                </div>
                <div style={{background:C.bg,borderRadius:8,padding:12}}>
                  <ProbBar value={queryResult.mossos} type="mossos"/>
                  <ProbBar value={queryResult.guardia} type="guardia"/>
                  <ProbBar value={queryResult.local} type="local"/>
                </div>
                <div style={{marginTop:10,padding:10,background:C.accentDim,borderRadius:8,border:`1px solid ${C.accentGlow}`}}>
                  <div style={{fontSize:13,color:C.accent,fontWeight:700}}>{(queryResult.overall||0)>0.6?"⚠ Alta probabilitat":(queryResult.overall||0)>0.35?"◎ Probabilitat moderada":"✓ Baixa probabilitat"}</div>
                  <div style={{fontSize:13,color:C.textDim,marginTop:4}}>Basat en {queryResult.sample_size||0} registres · Fiabilitat: {queryResult.reliability||"baixa"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORIAL */}
        {tab==="history"&&(
          <div>
            <div style={{display:"flex",gap:6,marginBottom:10,overflowX:"auto"}}>
              {[["all","Tots"],["mossos","MSE"],["guardia","GC"],["local","PL"]].map(([k,l])=>(
                <button key={k} onClick={()=>setFilterType(k)} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${filterType===k?C.accent:C.border}`,background:filterType===k?C.accentDim:"transparent",color:filterType===k?C.accent:C.textDim,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:11,color:C.textDim,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
              <span>{filtDets.length} registres</span>
              <span style={{color:C.textMuted}}>Toca per veure detalls</span>
            </div>
            {filtDets.length===0?(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:20,textAlign:"center"}}><div style={{fontSize:14,color:C.textDim}}>Sense deteccions</div></div>
            ):(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                {filtDets.map((d,i)=>{
                  const ptype=PT[d.patrol_type]||PT.unknown;
                  const time=d.created_at?new Date(d.created_at).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"??";
                  return(
                    <div
                      key={i}
                      onClick={()=>setSelectedDet(d)}
                      style={{
                        display:"flex",alignItems:"center",gap:8,
                        padding:"7px 10px",
                        borderLeft:`3px solid ${ptype.color}`,
                        borderBottom:i<filtDets.length-1?`1px solid ${C.border}`:"none",
                        cursor:"pointer",
                      }}
                    >
                      <span style={{fontSize:10,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"1px 5px",borderRadius:3,flexShrink:0,minWidth:32,textAlign:"center"}}>{ptype.short}</span>
                      <span style={{fontSize:11,color:C.text,flexShrink:0,fontWeight:600,whiteSpace:"nowrap"}}>{d.zone_norm||d.zone}</span>
                      <span style={{fontSize:10,color:C.textDim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:"italic"}}>{d.raw_message||"—"}</span>
                      <span style={{fontSize:10,color:C.accent,flexShrink:0,fontWeight:600}}>{time}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CONFIG */}
        {tab==="config"&&(
          <div>
            {/* 🎨 Skin / Tema */}
            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:8,color:C.accent}}>🎨 Skin de l'app</div>
              <div style={{fontSize:13,color:C.textDim,marginBottom:12,lineHeight:1.5}}>
                Tria l'aspecte. El canvi és instantani i es desa al navegador.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:8}}>
                {Object.entries(THEMES).map(([key,t])=>{
                  const isActive = themeName===key;
                  return(
                    <button
                      key={key}
                      onClick={()=>setThemeName(key)}
                      style={{
                        position:"relative",
                        padding:"12px 10px",
                        background:t.bg,
                        backgroundImage:t.pattern||"none",
                        backgroundSize:t.pattern?"160px 160px":undefined,
                        color:t.text,
                        border:`2px solid ${isActive?t.accent:t.border}`,
                        borderRadius:10,
                        cursor:"pointer",
                        fontFamily:"inherit",
                        textAlign:"left",
                        overflow:"hidden",
                        boxShadow:isActive?`0 0 14px ${t.accentGlow}`:"none",
                        transition:"all 0.2s",
                      }}
                    >
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                        <span style={{fontSize:18}}>{t.emoji}</span>
                        <span style={{fontSize:13,fontWeight:700,color:t.accent}}>{t.label}</span>
                        {isActive&&<span style={{marginLeft:"auto",fontSize:11,color:t.accent}}>✓</span>}
                      </div>
                      {/* Mostra-li els colors clau perquè es vegi de què va */}
                      <div style={{display:"flex",gap:4}}>
                        <div style={{flex:1,height:8,borderRadius:2,background:t.accent}}/>
                        <div style={{flex:1,height:8,borderRadius:2,background:t.mossos}}/>
                        <div style={{flex:1,height:8,borderRadius:2,background:t.guardia}}/>
                        <div style={{flex:1,height:8,borderRadius:2,background:t.local}}/>
                        <div style={{flex:1,height:8,borderRadius:2,background:t.danger}}/>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 🔑 Token per reportar */}
            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:8,color:C.accent}}>🔑 Token per reportar</div>
              <div style={{fontSize:14,color:C.textDim,marginBottom:12,lineHeight:1.5}}>
                Necessari per al botó "+ Reportar". És el token que vas configurar al Worker amb <code style={{background:C.bg,padding:"2px 6px",borderRadius:3,fontSize:13}}>npm run secret:set</code>. Es guarda només al teu navegador.
              </div>
              <input
                type="password"
                value={apiToken}
                onChange={e=>setApiToken(e.target.value)}
                placeholder="Enganxa aquí el token (64 caràcters hex)"
                style={{...ss,boxSizing:"border-box",fontFamily:"monospace",fontSize:14,padding:"12px 14px"}}
              />
              <div style={{fontSize:13,color:apiToken?C.success:C.warning,marginTop:8}}>
                {apiToken?`✓ Token configurat (${apiToken.length} caràcters)`:"⚠ Sense token: el botó de reportar no funcionarà"}
              </div>
            </div>

            {/* ✈️ Telegram */}
            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:8,color:C.accent}}>✈️ Connectar grup de Telegram</div>
              <div style={{fontSize:14,color:C.textDim,marginBottom:14,lineHeight:1.5}}>
                Toca el botó i Telegram t'obrirà amb la llista dels teus grups. Tria un grup → el bot s'hi afegirà automàticament i els missatges començaran a arribar aquí. <b>No has de crear cap bot.</b>
              </div>
              <button
                onClick={()=>{if(addGroupUrl)window.open(addGroupUrl,"_blank","noopener");}}
                disabled={!botUsername}
                style={{
                  width:"100%",padding:"16px 18px",
                  background:botUsername?"#229ED9":C.border,
                  color:botUsername?"#fff":C.textDim,
                  border:"none",borderRadius:10,
                  fontSize:16,fontWeight:800,cursor:botUsername?"pointer":"not-allowed",fontFamily:"inherit",
                  boxShadow:botUsername?"0 0 18px #229ED966":"none",
                  marginBottom:14,
                }}
              >+ AFEGIR GRUP AL BOT</button>

              {/* Per a TOTS els usuaris — instruccions simples i clares */}
              <div style={{background:`${C.success}11`,borderRadius:8,border:`1px solid ${C.success}55`,padding:14,marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:C.success,marginBottom:8,letterSpacing:"0.03em"}}>✨ COM AFEGIR EL TEU GRUP (2 tocs)</div>
                <ol style={{margin:0,paddingLeft:20,fontSize:13,color:C.text,lineHeight:1.7}}>
                  <li>Toca el botó blau <b>"+ AFEGIR GRUP AL BOT"</b> de dalt</li>
                  <li>Telegram s'obrirà i et mostrarà la llista dels teus grups → <b>tria el grup</b> on vols capturar les patrulles</li>
                </ol>
                <div style={{fontSize:12,color:C.textDim,marginTop:8,lineHeight:1.5}}>
                  Llest. Els missatges d'aquell grup amb paraules tipus "mossos", "control", "patrulla"... apareixeran aquí automàticament. Pots afegir tants grups com vulguis repetint el procés.
                </div>
              </div>


              <div style={{fontSize:13,color:C.textDim,marginBottom:6}}>Nom del bot (sense @):</div>
              <input
                value={botUsername}
                onChange={e=>setBotUsername(e.target.value)}
                placeholder="Patrol_trackBot"
                style={{...ss,boxSizing:"border-box",fontSize:14,fontFamily:"monospace",padding:"12px 14px"}}
              />
              <div style={{fontSize:12,color:C.textMuted,marginTop:6}}>
                Per defecte: Patrol_trackBot. Canvia-ho si has creat el bot amb un altre nom.
              </div>

              <div style={{marginTop:16,padding:12,background:C.bg,borderRadius:8,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>📤 Compartir l'app amb amics</div>
                <div style={{fontSize:13,color:C.textDim,marginBottom:10,lineHeight:1.5}}>
                  Comparteix aquest enllaç i el teu amic podrà afegir els seus propis grups sense res més que tocar el botó de dalt:
                </div>
                <div style={{display:"flex",gap:8}}>
                  <input
                    readOnly
                    value={shareAppUrl}
                    onClick={e=>{e.target.select();}}
                    style={{...ss,boxSizing:"border-box",fontSize:13,fontFamily:"monospace",flex:1,padding:"10px 12px"}}
                  />
                  <button
                    onClick={()=>{
                      if(navigator.share){navigator.share({title:"PatrolTrack",url:shareAppUrl}).catch(()=>{});}
                      else if(navigator.clipboard){navigator.clipboard.writeText(shareAppUrl);alert("Enllaç copiat!");}
                    }}
                    style={{padding:"10px 16px",background:C.accent,color:"#000",border:"none",borderRadius:6,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                  >Compartir</button>
                </div>
              </div>
            </div>

            {/* 📡 Grups connectats */}
            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
                <div style={{fontSize:17,fontWeight:700,color:C.accent}}>📡 Grups connectats</div>
                <div style={{fontSize:12,color:C.textDim}}>{groupsAggregate.length} grup{groupsAggregate.length===1?"":"s"}</div>
              </div>
              <div style={{fontSize:13,color:C.textDim,marginBottom:12,lineHeight:1.5}}>
                Cada grup de Telegram o WhatsApp que hagi enviat com a mínim una detecció. Toca un grup per veure'n els missatges i tenir l'opció d'esborrar-los.
              </div>
              {groupsAggregate.length===0?(
                <div style={{padding:14,background:C.bg,borderRadius:8,border:`1px dashed ${C.border}`,textAlign:"center",fontSize:13,color:C.textDim}}>
                  Encara no hi ha cap detecció amb grup. Afegeix el bot a un grup de Telegram amb el botó de dalt.
                </div>
              ):(
                groupsAggregate.map((g,i)=>{
                  const isTopic = g.name.includes("› topic#");
                  const sourceList = [...g.sources].map(s=>s.toUpperCase()).join("·");
                  const time = g.latest?new Date(g.latest).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
                  return(
                    <div
                      key={i}
                      onClick={()=>setSelectedGroup(g)}
                      style={{
                        background:C.bg,
                        border:`1px solid ${C.border}`,
                        borderLeft:`3px solid ${isTopic?C.warning:C.success}`,
                        borderRadius:8,
                        padding:"10px 12px",
                        marginBottom:6,
                        cursor:"pointer",
                        display:"flex",
                        justifyContent:"space-between",
                        alignItems:"center",
                        gap:10,
                      }}
                    >
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</div>
                        <div style={{fontSize:11,color:C.textDim,marginTop:2}}>
                          {sourceList} · <span style={{color:C.accent,fontWeight:700}}>{g.count}</span> dets · última {time}
                        </div>
                      </div>
                      <div style={{fontSize:18,color:C.textMuted,flexShrink:0}}>›</div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:14,color:C.accent}}>Fonts de dades</div>
              {(()=>{
                // Recompte real per font llegit de les deteccions
                const counts={};
                const latest={};
                for(const d of detections){
                  const s=(d.source||"unknown").toLowerCase();
                  counts[s]=(counts[s]||0)+1;
                  if(!latest[s]||(d.created_at&&d.created_at>latest[s]))latest[s]=d.created_at;
                }
                const fmt=(iso)=>iso?new Date(iso).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
                const items=[
                  {key:"telegram",label:"Telegram",icon:"✈"},
                  {key:"whatsapp",label:"WhatsApp",icon:"◎"},
                  {key:"manual",  label:"Reports manuals",icon:"✋"},
                ];
                return items.map(s=>{
                  const n=counts[s.key]||0;
                  const active=n>0;
                  const status=active?`✓ Actiu · ${n} dets · última ${fmt(latest[s.key])}`:"En espera (sense missatges encara)";
                  return(
                    <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.border}`,gap:10}}>
                      <div style={{display:"flex",gap:12,alignItems:"center",flex:1,minWidth:0}}>
                        <div style={{width:40,height:40,borderRadius:8,background:active?`${C.success}22`:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,color:active?C.success:C.textDim}}>{s.icon}</div>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{fontSize:16,fontWeight:600}}>{s.label}</div>
                          <div style={{fontSize:12,color:active?C.success:C.textDim,overflow:"hidden",textOverflow:"ellipsis"}}>{status}</div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
              <div style={{fontSize:11,color:C.textMuted,marginTop:10,lineHeight:1.5,fontStyle:"italic"}}>
                "Actiu" significa que ja hi ha hagut missatges arribant per aquesta via. "En espera" vol dir que el camí està obert però encara ningú no n'ha enviat cap.
              </div>
            </div>
            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:12,color:C.accent}}>Estat del sistema</div>
              {[{label:"Backend API",value:health?"En línia":"Fora de línia",ok:!!health},{label:"Base de dades",value:health?`${health.total} registres`:"—",ok:!!health},{label:"Última 24h",value:health?`${health.last_24h} deteccions`:"—",ok:true}].map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:15,color:C.textDim}}>{s.label}</span>
                  <span style={{fontSize:15,color:s.ok?C.success:C.danger,fontWeight:600}}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de detall d'un grup connectat */}
      {selectedGroup&&(()=>{
        const g = selectedGroup;
        const isTopic = g.name.includes("› topic#");
        const isTg = [...g.sources].some(s=>s==="telegram");
        return(
          <div onClick={()=>setSelectedGroup(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9600,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:600,maxHeight:"88vh",overflowY:"auto",background:C.surface,borderTop:`3px solid ${isTopic?C.warning:C.success}`,borderRadius:"16px 16px 0 0",padding:18,boxShadow:`0 -10px 40px rgba(0,0,0,0.7)`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:14}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:C.textDim,letterSpacing:"0.05em",marginBottom:4}}>GRUP CONNECTAT</div>
                  <div style={{fontSize:16,fontWeight:800,color:C.text,wordBreak:"break-word"}}>{g.name}</div>
                  <div style={{fontSize:12,color:C.textDim,marginTop:6}}>
                    {[...g.sources].map(s=>s.toUpperCase()).join(" · ")} · <span style={{color:C.accent,fontWeight:700}}>{g.count}</span> deteccions
                  </div>
                </div>
                <button onClick={()=>setSelectedGroup(null)} style={{background:"none",border:"none",color:C.textDim,fontSize:24,cursor:"pointer",lineHeight:1,flexShrink:0}}>✕</button>
              </div>

              <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8,marginTop:6}}>Últims missatges</div>
              <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:14}}>
                {g.detections.slice(0,15).map((d,i)=>{
                  const ptype=PT[d.patrol_type]||PT.unknown;
                  const time=d.created_at?new Date(d.created_at).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"??";
                  return(
                    <div key={i} onClick={()=>{setSelectedGroup(null);setSelectedDet(d);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderBottom:i<Math.min(g.detections.length,15)-1?`1px solid ${C.border}`:"none",cursor:"pointer",borderLeft:`3px solid ${ptype.color}`}}>
                      <span style={{fontSize:10,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"1px 5px",borderRadius:3,flexShrink:0,minWidth:34,textAlign:"center"}}>{ptype.short}</span>
                      <span style={{fontSize:11,color:C.text,flexShrink:0,fontWeight:600}}>{d.zone_norm||d.zone}</span>
                      <span style={{fontSize:10,color:C.textDim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:"italic"}}>{d.raw_message||"—"}</span>
                      <span style={{fontSize:10,color:C.accent,flexShrink:0,fontWeight:600}}>{time}</span>
                    </div>
                  );
                })}
                {g.detections.length>15&&<div style={{padding:"6px 10px",fontSize:11,color:C.textMuted,textAlign:"center",fontStyle:"italic"}}>...i {g.detections.length-15} més</div>}
              </div>

              {isTg&&(
                <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:12,fontSize:12,color:C.textDim,lineHeight:1.5}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6}}>🤖 Treure el bot d'aquest grup</div>
                  Cal fer-ho <b>manualment des de Telegram</b>: obre el grup → toca el nom del grup a dalt → membres → @Patrol_trackBot → "Eliminar del grup". A partir d'aquell moment ja no arribaran missatges nous d'aquest grup.
                </div>
              )}

              <button
                onClick={()=>deleteGroupDetections(g.name)}
                disabled={deletingGroup===g.name||!apiToken}
                style={{
                  width:"100%",padding:12,
                  background:deletingGroup===g.name?C.border:`${C.danger}22`,
                  color:deletingGroup===g.name?C.textDim:C.danger,
                  border:`1px solid ${C.danger}`,
                  borderRadius:8,fontSize:13,fontWeight:700,
                  cursor:apiToken&&!deletingGroup?"pointer":"not-allowed",
                  fontFamily:"inherit",
                  opacity:apiToken?1:0.5,
                }}
              >
                {deletingGroup===g.name?"Esborrant…":`🗑 Buidar ${g.count} deteccions d'aquest grup`}
              </button>
              {!apiToken&&<div style={{fontSize:11,color:C.warning,marginTop:6,textAlign:"center"}}>⚠ Necessites el token API a Config per esborrar</div>}

              <button onClick={()=>setSelectedGroup(null)} style={{width:"100%",marginTop:10,padding:12,background:"transparent",color:C.textDim,border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Tancar</button>
            </div>
          </div>
        );
      })()}

      {/* Modal de detall d'una zona (apareix tocant zones del mapa o del top-zones) */}
      {zoneDetail&&(()=>{
        const zoneName = zoneDetail;
        const zoneDets = detections.filter(d=>(d.zone_norm||d.zone)===zoneName);
        const byHour = Array(24).fill(0);
        zoneDets.forEach(d=>{if(d.created_at)byHour[new Date(d.created_at).getHours()]++;});
        const maxH = Math.max(...byHour, 1);
        const byType = {mossos:0,guardia:0,local:0,unknown:0};
        zoneDets.forEach(d=>{byType[d.patrol_type]=(byType[d.patrol_type]||0)+1;});
        const mapZone = MAP_ZONES.find(z=>z.id===zoneName);
        return(
          <div onClick={()=>setZoneDetail(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9600,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:600,maxHeight:"88vh",overflowY:"auto",background:C.surface,borderTop:`3px solid ${C.accent}`,borderRadius:"16px 16px 0 0",padding:18,boxShadow:`0 -10px 40px rgba(0,0,0,0.7)`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:14}}>
                <div>
                  <div style={{fontSize:11,color:C.textDim,letterSpacing:"0.05em",marginBottom:4}}>ZONA</div>
                  <div style={{fontSize:20,fontWeight:800,color:C.accent}}>{zoneName}</div>
                  <div style={{fontSize:13,color:C.textDim,marginTop:4}}>
                    <span style={{color:C.text,fontWeight:700}}>{zoneDets.length}</span> deteccions registrades
                  </div>
                </div>
                <button onClick={()=>setZoneDetail(null)} style={{background:"none",border:"none",color:C.textDim,fontSize:24,cursor:"pointer",lineHeight:1}}>✕</button>
              </div>

              {/* Mini gràfic per hora */}
              {zoneDets.length>0&&(<>
                <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Distribució per hora</div>
                <div style={{display:"flex",gap:2,alignItems:"flex-end",height:48,background:C.bg,padding:"6px 8px",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:14}}>
                  {byHour.map((n,h)=>{
                    const v=n/maxH;
                    const col=v>0.66?C.danger:v>0.33?C.warning:C.success;
                    return(<div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                      <div style={{width:"100%",height:Math.round(v*36)+2,background:n>0?col:C.border,opacity:n>0?0.85:0.3,borderRadius:"2px 2px 0 0"}}/>
                      {h%6===0&&<span style={{fontSize:8,color:C.textMuted}}>{h}</span>}
                    </div>);
                  })}
                </div>

                {/* Per tipus de patrulla */}
                <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Per tipus</div>
                <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                  {Object.entries(byType).filter(([,n])=>n>0).map(([t,n])=>{
                    const pt=PT[t]||PT.unknown;
                    return(<div key={t} style={{background:`${pt.color}22`,color:pt.color,padding:"5px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>{pt.short} · {n}</div>);
                  })}
                </div>
              </>)}

              <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Deteccions ({zoneDets.length})</div>
              {zoneDets.length===0?(
                <div style={{padding:14,background:C.bg,border:`1px dashed ${C.border}`,borderRadius:8,textAlign:"center",fontSize:13,color:C.textDim,marginBottom:14}}>Cap detecció encara en aquesta zona</div>
              ):(
                <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:14}}>
                  {zoneDets.slice(0,12).map((d,i)=>{
                    const ptype=PT[d.patrol_type]||PT.unknown;
                    const time=d.created_at?new Date(d.created_at).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"??";
                    return(<div key={i} onClick={()=>{setZoneDetail(null);setSelectedDet(d);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderBottom:i<Math.min(zoneDets.length,12)-1?`1px solid ${C.border}`:"none",cursor:"pointer",borderLeft:`3px solid ${ptype.color}`}}>
                      <span style={{fontSize:10,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"1px 5px",borderRadius:3,flexShrink:0,minWidth:34,textAlign:"center"}}>{ptype.short}</span>
                      <span style={{fontSize:10,color:C.textDim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:"italic"}}>{d.raw_message||"—"}</span>
                      <span style={{fontSize:10,color:C.accent,flexShrink:0,fontWeight:600}}>{time}</span>
                    </div>);
                  })}
                </div>
              )}

              {mapZone&&(
                <a href={`https://www.openstreetmap.org/?mlat=${mapZone.lat}&mlon=${mapZone.lng}&zoom=12`} target="_blank" rel="noopener noreferrer"
                  style={{display:"block",padding:12,background:C.bg,border:`1px solid ${C.accent}55`,borderRadius:8,color:C.accent,textDecoration:"none",fontSize:13,fontWeight:700,textAlign:"center",marginBottom:10}}>
                  📍 Veure {zoneName} a OpenStreetMap
                </a>
              )}
              <button onClick={()=>setZoneDetail(null)} style={{width:"100%",padding:12,background:"transparent",color:C.textDim,border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Tancar</button>
            </div>
          </div>
        );
      })()}

      {/* Modal de detall d'una detecció */}
      {selectedDet&&(()=>{
        const d=selectedDet;
        const ptype=PT[d.patrol_type]||PT.unknown;
        const dt=d.created_at?new Date(d.created_at):null;
        const dateStr=dt?dt.toLocaleDateString("ca-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"?";
        const timeStr=dt?dt.toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"?";
        return(
          <div onClick={()=>setSelectedDet(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9500,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,maxHeight:"86vh",overflowY:"auto",background:C.surface,borderTop:`3px solid ${ptype.color}`,borderRadius:"16px 16px 0 0",padding:18,boxShadow:`0 -10px 40px rgba(0,0,0,0.6)`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:17,fontWeight:800,color:ptype.color}}>{ptype.label}</div>
                <button onClick={()=>setSelectedDet(null)} style={{background:"none",border:"none",color:C.textDim,fontSize:24,cursor:"pointer",lineHeight:1}}>✕</button>
              </div>

              {d.raw_message&&(
                <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:14,fontSize:14,color:C.text,lineHeight:1.5,fontStyle:"italic"}}>
                  "{d.raw_message}"
                </div>
              )}

              <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"10px 14px",fontSize:14}}>
                <span style={{color:C.textDim}}>Zona:</span>
                <span style={{color:C.text,fontWeight:600}}>{d.zone_norm||d.zone||"?"}</span>

                {d.pk&&<>
                  <span style={{color:C.textDim}}>Punt km:</span>
                  <span style={{color:C.warning,fontWeight:600}}>{d.pk}</span>
                </>}

                <span style={{color:C.textDim}}>Data:</span>
                <span style={{color:C.text}}>{dateStr}</span>

                <span style={{color:C.textDim}}>Hora:</span>
                <span style={{color:C.text}}>{timeStr}</span>

                <span style={{color:C.textDim}}>Font:</span>
                <span style={{color:C.text}}>{(d.source||"?").toUpperCase()}</span>

                {d.group_name&&<>
                  <span style={{color:C.textDim}}>Grup:</span>
                  <span style={{color:C.text,wordBreak:"break-word"}}>{d.group_name}</span>
                </>}

                <span style={{color:C.textDim}}>Confiança:</span>
                <span style={{color:d.confidence==="alta"?C.success:d.confidence==="mitja"?C.warning:C.textMuted,fontWeight:600,textTransform:"capitalize"}}>{d.confidence||"?"}</span>

                {(d.lat!=null&&d.lng!=null)&&<>
                  <span style={{color:C.textDim}}>Coordenades:</span>
                  <span style={{color:C.text,fontFamily:"monospace",fontSize:13}}>{Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)}</span>
                </>}

                {d.id&&<>
                  <span style={{color:C.textMuted,fontSize:12}}>ID:</span>
                  <span style={{color:C.textMuted,fontSize:12,fontFamily:"monospace"}}>#{d.id}</span>
                </>}
              </div>

              {(d.lat!=null&&d.lng!=null)&&(
                <a
                  href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}&zoom=14`}
                  target="_blank" rel="noopener noreferrer"
                  style={{display:"block",marginTop:14,padding:12,background:C.bg,border:`1px solid ${C.accent}55`,borderRadius:8,color:C.accent,textDecoration:"none",fontSize:14,fontWeight:700,textAlign:"center"}}
                >
                  📍 Veure al mapa
                </a>
              )}

              <button
                onClick={()=>setSelectedDet(null)}
                style={{width:"100%",marginTop:14,padding:12,background:"transparent",color:C.textDim,border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
              >Tancar</button>
            </div>
          </div>
        );
      })()}

      {/* Botó flotant "+ Reportar" */}
      <button
        onClick={()=>{setShowReport(true);setReportResult(null);}}
        title="Reportar patrulla"
        style={{
          position:"fixed",bottom:84,right:18,zIndex:9000,
          width:60,height:60,borderRadius:"50%",
          background:C.accent,color:"#000",border:"none",
          fontSize:30,fontWeight:900,cursor:"pointer",fontFamily:"inherit",
          boxShadow:`0 4px 18px ${C.accent}77, 0 0 28px ${C.accent}33`,
        }}
      >+</button>

      {/* Modal de report manual */}
      {showReport&&(
        <div
          onClick={()=>{if(!reporting)setShowReport(false);}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9500,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
        >
          <div
            onClick={e=>e.stopPropagation()}
            style={{width:"100%",maxWidth:520,background:C.surface,borderTop:`2px solid ${C.accent}`,borderRadius:"16px 16px 0 0",padding:18,boxShadow:`0 -10px 40px rgba(0,0,0,0.6)`}}
          >
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:16,fontWeight:800,color:C.accent}}>📣 Reportar patrulla</div>
              <button onClick={()=>setShowReport(false)} style={{background:"none",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>

            <div style={{fontSize:12,color:C.textDim,marginBottom:8}}>
              Enganxa o escriu el missatge. L'app extreu zona, tipus de patrulla i PK automàticament.
            </div>

            <textarea
              value={reportMsg}
              onChange={e=>setReportMsg(e.target.value)}
              placeholder="Ex: Mossos a la N-II km 45, cuidado"
              autoFocus
              rows={4}
              style={{...ss,boxSizing:"border-box",resize:"vertical",minHeight:80,fontSize:14,lineHeight:1.4}}
            />

            <input
              value={reportGroup}
              onChange={e=>setReportGroup(e.target.value)}
              placeholder="Nom del grup (opcional)"
              style={{...ss,boxSizing:"border-box",fontSize:13,marginTop:8}}
            />

            {reportResult&&(
              <div style={{
                marginTop:10,padding:10,borderRadius:8,fontSize:13,
                background:reportResult.ok&&reportResult.stored?`${C.success}22`:reportResult.ok?`${C.warning}22`:`${C.danger}22`,
                border:`1px solid ${reportResult.ok&&reportResult.stored?C.success:reportResult.ok?C.warning:C.danger}`,
                color:reportResult.ok&&reportResult.stored?C.success:reportResult.ok?C.warning:C.danger,
              }}>
                {reportResult.ok&&reportResult.stored
                  ? `✓ Desat: ${reportResult.patrol_type?.toUpperCase()||"?"} · ${reportResult.zone_norm||"?"} · confiança ${reportResult.confidence||"?"}`
                  : reportResult.ok
                    ? `⚠ No s'ha desat: ${reportResult.reason||"el missatge no parla de patrulles"}`
                    : `✗ Error: ${reportResult.reason||"desconegut"}`}
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button
                onClick={()=>setShowReport(false)}
                disabled={reporting}
                style={{flex:1,padding:12,background:"transparent",color:C.textDim,border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
              >Tancar</button>
              <button
                onClick={sendReport}
                disabled={reporting||!reportMsg.trim()}
                style={{flex:2,padding:12,background:reporting?C.border:C.accent,color:reporting?C.textDim:"#000",border:"none",borderRadius:8,fontSize:14,fontWeight:800,cursor:reporting?"wait":"pointer",fontFamily:"inherit",opacity:reporting||!reportMsg.trim()?0.6:1}}
              >{reporting?"ENVIANT…":"ENVIAR"}</button>
            </div>

            {!apiToken&&(
              <div style={{marginTop:10,fontSize:11,color:C.warning,textAlign:"center"}}>
                ⚠ Necessites configurar el token a la pestanya <b>Config</b> primer
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom nav — 7 pestanyes que comparteixen ample equitatiu, icones SVG */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9800,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",padding:"8px 0 max(10px, env(safe-area-inset-bottom))",boxShadow:"0 -2px 12px rgba(0,0,0,0.35)"}}>
        {tabs.map(t=>{
          const active=tab===t.id;
          const col=active?C.accent:C.textMuted;
          return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"1 1 0",minWidth:0,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"2px 2px"}}>
              <TabIcon id={t.id} color={col} size={active?22:20}/>
              <span style={{fontSize:10,color:col,letterSpacing:"0.02em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
    </ThemeContext.Provider>
  );
}
