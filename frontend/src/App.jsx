import { useState, useEffect, useRef, useCallback } from "react";

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

const C = {
  bg: "#0a0c10", surface: "#111318", border: "#2a3340",
  accent: "#ffb84d", accentDim: "#ffb84d2a", accentGlow: "#ffb84d66",
  mossos: "#60a5fa", guardia: "#4ade80", local: "#c084fc",
  text: "#f5f7fb", textDim: "#b8c0cc", textMuted: "#8a92a3",
  danger: "#ff5757", warning: "#ffb020", success: "#22d97a",
};

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

// ── Hook RADAR (estat compartit App + Splash + Tab) ───────────────────────
function useRadar(zoneData){
  const [active,setActive]=useState(false);
  const [pos,setPos]=useState(null);
  const [err,setErr]=useState(null);
  const [nearby,setNearby]=useState([]);
  const [alert,setAlert]=useState(false);
  const [sound,setSound]=useState(true);
  const [thresh,setThresh]=useState(0.4);
  const [lastBark,setLastBark]=useState(0);
  const audioRef=useRef(null);
  const watchRef=useRef(null);

  const initAudio=()=>{if(!audioRef.current)audioRef.current=new(window.AudioContext||window.webkitAudioContext)();};

  const check=useCallback((lat,lng)=>{
    const nb=MAP_ZONES.map(z=>({...z,dist:Math.round(distKm(lat,lng,z.lat,z.lng)*10)/10,prob:zoneData[z.id]||0}))
      .filter(z=>z.dist<z.rKm+8).sort((a,b)=>a.dist-b.dist);
    setNearby(nb);
    const danger=nb.find(z=>z.dist<z.rKm&&z.prob>=thresh);
    setAlert(!!danger);
    if(danger&&sound&&Date.now()-lastBark>10000){initAudio();playBark(audioRef.current);setLastBark(Date.now());}
  },[zoneData,thresh,sound,lastBark]);

  const start=useCallback(()=>{
    initAudio();
    if(!navigator.geolocation){setErr("GPS no disponible");return;}
    setActive(true);setErr(null);
    try{localStorage.setItem("pt_auto","1");}catch{}
    watchRef.current=navigator.geolocation.watchPosition(
      p=>{setPos({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy});check(p.coords.latitude,p.coords.longitude);},
      ()=>{setErr("Permet l'accés a la ubicació al navegador");setActive(false);},
      {enableHighAccuracy:true,maximumAge:5000,timeout:10000}
    );
  },[check]);

  const stop=useCallback(()=>{
    if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);
    setActive(false);setPos(null);setNearby([]);setAlert(false);
    try{localStorage.removeItem("pt_auto");}catch{}
  },[]);

  // Apaga/encén el so: suspèn l'AudioContext perquè qualsevol lladruc
  // ja planificat (i no només els futurs) s'aturi a l'instant.
  const toggleSound=useCallback(()=>{
    setSound(prev=>{
      const next=!prev;
      const ctx=audioRef.current;
      if(ctx){
        if(next)ctx.resume().catch(()=>{});
        else ctx.suspend().catch(()=>{});
      }
      return next;
    });
  },[]);

  useEffect(()=>()=>{if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);},[]);
  useEffect(()=>{if(pos)check(pos.lat,pos.lng);},[zoneData,check,pos]);

  return {active,pos,err,nearby,alert,sound,toggleSound,thresh,setThresh,start,stop};
}

// ── Splash d'auto-activació ───────────────────────────────────────────────
function Splash({onActivate,onSkip,wasActive,dogPhoto}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:10000,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Mono','Courier New',monospace"}}>
      <img src={dogPhoto} alt="PatrolTrack" style={{width:180,height:180,borderRadius:"50%",objectFit:"cover",objectPosition:"center 20%",marginBottom:18,border:`3px solid ${C.accent}`,boxShadow:`0 0 32px ${C.accent}55`}}/>
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
function RadarTab({radar,dogPhoto="/dog.png"}){
  const {active,pos,err,nearby,sound,toggleSound,thresh,setThresh,start,stop}=radar;
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
        <div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:14,color:C.textDim}}>Llindar d'alerta</span><span style={{fontSize:14,color:C.accent}}>{Math.round(thresh*100)}%</span></div>
          <input type="range" min={10} max={90} value={Math.round(thresh*100)} onChange={e=>setThresh(Number(e.target.value)/100)} style={{width:"100%",accentColor:C.accent}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.textMuted,marginTop:2}}><span>Sensible</span><span>Estricte</span></div>
        </div>
      </div>
      {active&&(
        <div>
          <div style={{fontSize:13,color:C.textDim,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.1em"}}>Zones properes</div>
          {nearby.length===0?(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:16,textAlign:"center"}}><div style={{fontSize:14,color:C.textDim}}>Cap zona a prop</div></div>
          ):nearby.slice(0,5).map((z,i)=>{
            const col=z.prob>0.6?C.danger:z.prob>0.35?C.warning:C.success;
            const isDanger=z.dist<z.rKm&&z.prob>=thresh;
            return(
              <div key={i} style={{background:isDanger?`${C.danger}22`:C.surface,border:`1px solid ${isDanger?C.danger:C.border}`,borderLeft:`3px solid ${col}`,borderRadius:8,padding:"10px 12px",marginBottom:6,boxShadow:isDanger?`0 0 12px ${C.danger}44`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:15,fontWeight:700,color:C.text}}>{z.id}</span><span style={{fontSize:16,fontWeight:800,color:col}}>{Math.round(z.prob*100)}%</span></div>
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:C.textDim}}>{isDanger?"🚨 ":"📍 "}{z.dist} km</span>{isDanger&&<span style={{fontSize:13,color:C.danger,fontWeight:700}}>ZONA DE RISC</span>}</div>
              </div>
            );
          })}
        </div>
      )}
      {!active&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:24,textAlign:"center"}}><img src={dogPhoto} alt="" style={{width:96,height:96,borderRadius:"50%",objectFit:"cover",objectPosition:"center 20%",marginBottom:12,border:`2px solid ${C.accent}55`}}/><div style={{fontSize:15,color:C.text,fontWeight:700,marginBottom:6}}>Radar de patrulles</div><div style={{fontSize:13,color:C.textDim,lineHeight:1.7}}>Activa el radar per rebre alertes automàtiques quan t'acostis a una zona de risc. Et ladrarà quan hi hagi perill!</div></div>}
      <style>{`@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.02)}}`}</style>
    </div>
  );
}

// ── Pestanya ESTADÍSTIQUES ────────────────────────────────────────────────
function StatsTab({detections}){
  const [selDay,setSelDay]=useState(-1);// -1 = tots
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

  return(
    <div>
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

      {/* Top zones */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:10}}>Zones més actives</div>
        {topZones.length===0?<div style={{fontSize:13,color:C.textDim,textAlign:"center"}}>Sense dades</div>:
        topZones.map(([zone,count],i)=>(
          <div key={i} style={{marginBottom:8}}>
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
    </div>
  );
}

// ── Pestanya CALENDARI ────────────────────────────────────────────────────
function CalendarTab({detections}){
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [selDate,setSelDate]=useState(null);

  const detsByDate={};
  detections.forEach(d=>{
    if(!d.created_at)return;
    const dt=new Date(d.created_at);
    const key=`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    detsByDate[key]=(detsByDate[key]||[]);
    detsByDate[key].push(d);
  });

  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);

  const selKey=selDate?`${year}-${month}-${selDate}`:null;
  const selDets=selKey?detsByDate[selKey]||[]:[];

  const prevMonth=()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);setSelDate(null);};
  const nextMonth=()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);setSelDate(null);};

  return(
    <div>
      {/* Capçalera mes */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <button onClick={prevMonth} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:6,width:32,height:32,cursor:"pointer",fontSize:18}}>‹</button>
          <span style={{fontSize:16,fontWeight:700,color:C.accent}}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:6,width:32,height:32,cursor:"pointer",fontSize:18}}>›</button>
        </div>

        {/* Dies de la setmana */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
          {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:12,color:C.textDim,padding:"2px 0"}}>{d}</div>)}
        </div>

        {/* Dies */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
          {cells.map((day,i)=>{
            if(!day)return<div key={i}/>;
            const key=`${year}-${month}-${day}`;
            const dets=detsByDate[key]||[];
            const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
            const isSel=selDate===day;
            const hasHigh=dets.some(d=>d.confidence==="alta");
            const hasMid=dets.some(d=>d.confidence==="mitja");
            const dotCol=hasHigh?C.danger:hasMid?C.warning:C.success;
            return(
              <div key={i} onClick={()=>setSelDate(isSel?null:day)} style={{
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

      {/* Deteccions del dia seleccionat */}
      {selDate&&(
        <div>
          <div style={{fontSize:13,color:C.textDim,marginBottom:8}}>
            {selDets.length>0?`${selDets.length} deteccions el ${selDate} de ${MONTHS[month]}`:`Cap detecció el ${selDate} de ${MONTHS[month]}`}
          </div>
          {selDets.length===0?(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:16,textAlign:"center"}}>
              <div style={{fontSize:14,color:C.textDim}}>Dia tranquil ✓</div>
            </div>
          ):selDets.map((d,i)=>{
            const ptype=PT[d.patrol_type]||PT.unknown;
            const time=d.created_at?new Date(d.created_at).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"}):"??";
            return(
              <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:12,marginBottom:8}}>
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
        </div>
      )}
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
  const radar=useRadar(zoneProbs);
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

  // Estat per a la card desplegable d'ajuda del bot --------------------------
  const [showBotHelp,setShowBotHelp]=useState(false);
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

  useEffect(()=>{
    let alive=true;
    const fetch2=async()=>{
      let ok=false;
      try{
        const[hr,dr]=await Promise.all([
          fetch(`${API}/api/health`,{cache:"no-store"}).catch(()=>null),
          fetch(`${API}/api/detections?limit=50`,{cache:"no-store"}).catch(()=>null),
        ]);
        const h=hr&&hr.ok?await hr.json().catch(()=>null):null;
        const d=dr&&dr.ok?await dr.json().catch(()=>null):null;
        if(!alive)return;
        if(h){setHealth(h);try{localStorage.setItem("pt_health",JSON.stringify(h));}catch{}; ok=true;}
        if(Array.isArray(d)){
          if(d.length>prevCount.current&&prevCount.current>0){setNewAlert(d[0]);setTimeout(()=>{if(alive)setNewAlert(null);},4000);}
          prevCount.current=d.length;
          setDetections(d);
          try{localStorage.setItem("pt_detections",JSON.stringify(d));}catch{}
          const p={...getZoneP()};
          d.forEach(det=>{if(det.zone_norm&&p[det.zone_norm]!==undefined)p[det.zone_norm]=Math.min(1,(p[det.zone_norm]||0)+0.15);});
          setZoneProbs(p);
          ok=true;
        }
      }catch{/* deixa l'estat anterior intacte */}
      if(alive){
        setOnline(ok);
        if(ok){const t=Date.now();setLastSync(t);try{localStorage.setItem("pt_lastSync",String(t));}catch{}}
      }
    };
    fetch2();
    if(Object.keys(zoneProbs).length===0)setZoneProbs(getZoneP());
    const t=setInterval(fetch2,15000);
    return()=>{alive=false;clearInterval(t);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{setHourlyData(getHourly(selectedZone));},[selectedZone]);

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
    {id:"dashboard",icon:"◉",label:"Mapa"},
    {id:"radar",    icon:"🐕",label:"Radar"},
    {id:"query",    icon:"⊙",label:"Consulta"},
    {id:"stats",    icon:"📊",label:"Stats"},
    {id:"calendar", icon:"📅",label:"Calendari"},
    {id:"history",  icon:"≡", label:"Historial"},
    {id:"config",   icon:"⚙", label:"Config"},
  ];

  const ss={width:"100%",padding:"10px 12px",background:C.bg,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,fontSize:15,fontFamily:"inherit",outline:"none"};

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column"}}>
      {showSplash&&<Splash wasActive={wasActive} dogPhoto={dogPhoto} onActivate={()=>{radar.start();setShowSplash(false);}} onSkip={()=>setShowSplash(false)}/>}
      {radar.alert&&(()=>{const z=radar.nearby.find(n=>n.prob>=radar.thresh);return(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9998,background:C.danger,color:"#fff",padding:"12px 16px",textAlign:"center",boxShadow:`0 0 30px ${C.danger}88`,animation:"pulse 0.6s infinite alternate"}}>
          <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.05em"}}>🚨 PATRULLA PROPERA · {z?.id} · {z?.dist} km</div>
        </div>
      );})()}
      {newAlert&&(
        <div style={{position:"fixed",top:radar.alert?44:0,left:0,right:0,zIndex:9999,background:C.danger,color:"#fff",padding:"10px 16px",fontSize:14,fontWeight:700,display:"flex",justifyContent:"space-between"}}>
          <span>🚨 NOVA DETECCIÓ: {PT[newAlert.patrol_type]?.short} · {newAlert.zone_norm}</span>
          <span style={{opacity:0.8}}>{newAlert.source?.toUpperCase()}</span>
        </div>
      )}
      <style>{`@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.02)}}`}</style>

      {/* Header — la foto del gos és la PROTAGONISTA al centre */}
      {(()=>{
        const HEADER_H=130; // alçada total del header
        const DOG_H=Math.round(HEADER_H*0.68); // foto = 68% de l'alçada
        return(
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginTop:newAlert?40:0,height:HEADER_H,boxSizing:"border-box"}}>
            <div style={{flex:"0 1 auto",minWidth:0,maxWidth:"30%"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:C.accent,boxShadow:`0 0 8px ${C.accent}`,flexShrink:0}}/>
                <span style={{fontSize:15,fontWeight:700,letterSpacing:"0.03em",color:C.accent}}>PATROL<span style={{color:C.textDim}}>TRACK</span></span>
              </div>
              <div style={{fontSize:10,color:C.textDim,marginTop:2}}>Lleida · BETA</div>
              <div style={{fontSize:10,color:C.textMuted,marginTop:4,lineHeight:1.4}}>
                <div style={{color:online?C.success:C.danger,display:"flex",alignItems:"center",gap:3}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:online?C.success:C.danger,boxShadow:`0 0 4px ${online?C.success:C.danger}`}}/>
                  {online?"En línia":"Offline"}
                </div>
                <div>{health?`${health.total} dets · 24h:${health.last_24h}`:(detections.length?`${detections.length} dets`:"—")}</div>
              </div>
            </div>

            {/* Foto del gos — centrada, gran, ample tot el que pot */}
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
                  filter:`drop-shadow(0 0 12px ${C.accent}88)`,
                  display:"block",
                }}
              />
            </div>

            <div style={{flex:"0 1 auto",textAlign:"right",flexShrink:0,maxWidth:"22%"}}>
              <div style={{fontSize:18,fontWeight:700,whiteSpace:"nowrap"}}>{new Date().toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"})}</div>
              <div style={{fontSize:10,color:C.textDim,whiteSpace:"nowrap"}}>{new Date().toLocaleDateString("ca-ES",{weekday:"short",day:"numeric",month:"short"})}</div>
              {!online&&lastSync&&<div style={{fontSize:9,color:C.warning,whiteSpace:"nowrap",marginTop:2}}>últim: {new Date(lastSync).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"})}</div>}
            </div>
          </div>
        );
      })()}

      <div style={{flex:1,padding:"12px 12px 76px",overflowY:"auto"}}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <MapSVG zoneData={zoneProbs} onSelect={setSelectedZone} selected={selectedZone}/>
            <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div><div style={{fontSize:15,fontWeight:700}}>{selectedZone}</div><div style={{fontSize:13,color:C.textDim,marginTop:2}}>Ara · {curH}:00h</div></div>
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
                <div style={{fontSize:13,color:C.accent,marginTop:8}}>"Mossos a la N-II km 45, cuidado"</div>
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

        {tab==="radar"&&<RadarTab radar={radar} dogPhoto={dogPhoto}/>}
        {tab==="stats"&&<StatsTab detections={detections}/>}
        {tab==="calendar"&&<CalendarTab detections={detections}/>}

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

              {/* Card desplegable — només per al PROPIETARI (configuració inicial) */}
              <div style={{background:C.bg,borderRadius:8,border:`1px solid ${C.border}`,marginBottom:14,overflow:"hidden"}}>
                <button
                  onClick={()=>setShowBotHelp(v=>!v)}
                  style={{width:"100%",padding:"12px 14px",background:"transparent",color:C.textDim,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                >
                  <span>🔧 Configuració tècnica inicial (només el propietari, un sol cop)</span>
                  <span style={{fontSize:18,color:C.accent,transition:"transform 0.2s",transform:showBotHelp?"rotate(180deg)":"rotate(0deg)",flexShrink:0,marginLeft:6}}>▾</span>
                </button>
                {showBotHelp&&(
                  <div style={{padding:"4px 14px 14px",fontSize:12,color:C.textDim,lineHeight:1.6,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,color:C.textMuted,marginBottom:10,fontStyle:"italic"}}>
                      Si has rebut un enllaç d'un amic, <b>això NO et toca</b>. Salta directament al bloc verd de dalt.
                    </div>
                    {[
                      {n:"1",t:"Crea el bot",b:"A Telegram, busca @BotFather → escriu /newbot → segueix-li les instruccions. Apunta el TOKEN que et donarà."},
                      {n:"2",t:"Desactiva Privacy mode",b:"@BotFather → /mybots → tria el bot → Bot Settings → Group Privacy → Turn off. Imprescindible perquè el bot llegeixi els missatges normals dels grups."},
                      {n:"3",t:"Registra el webhook (al teu Mac)",b:"Terminal: bash /tmp/setup_webhook.sh, enganxa el token quan te'l demani. Això connecta el bot amb el servidor."},
                      {n:"4",t:"(Recomanat) Rota el token",b:"Quan tot funcioni, fes /revoke a @BotFather per tenir un token nou que només sàpigues tu. El bot segueix funcionant igual."},
                    ].map(s=>(
                      <div key={s.n} style={{display:"flex",gap:10,marginTop:10}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:C.border,color:C.textDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>{s.n}</div>
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontWeight:700,marginBottom:2,fontSize:13}}>{s.t}</div>
                          <div style={{fontSize:12}}>{s.b}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:14,color:C.accent}}>Fonts de dades</div>
              {[{key:"telegram",label:"Telegram",icon:"✈",status:"Configurat · en espera",sc:C.warning},{key:"whatsapp",label:"WhatsApp",icon:"◎",status:"Connectat via Web",sc:C.success}].map(s=>(
                <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    <div style={{width:40,height:40,borderRadius:8,background:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{s.icon}</div>
                    <div><div style={{fontSize:16,fontWeight:600}}>{s.label}</div><div style={{fontSize:14,color:s.sc}}>{s.status}</div></div>
                  </div>
                  <div onClick={()=>setSources(p=>({...p,[s.key]:!p[s.key]}))} style={{width:48,height:26,borderRadius:13,background:sources[s.key]?C.accent:C.border,position:"relative",cursor:"pointer",transition:"background 0.2s"}}>
                    <div style={{position:"absolute",top:2,left:sources[s.key]?24:2,width:22,height:22,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                  </div>
                </div>
              ))}
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

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",padding:"6px 0 10px",overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"0 0 auto",minWidth:50,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 8px"}}>
            <span style={{fontSize:tab===t.id?20:17,color:tab===t.id?C.accent:C.textMuted}}>{t.icon}</span>
            <span style={{fontSize:11,color:tab===t.id?C.accent:C.textMuted,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
