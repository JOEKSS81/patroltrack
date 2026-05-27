import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://elusive-saturate-qualified.ngrok-free.dev";

const C = {
  bg: "#0a0c10", surface: "#111318", border: "#1e2530",
  accent: "#f5a623", accentDim: "#f5a62322", accentGlow: "#f5a62355",
  mossos: "#3b82f6", guardia: "#22c55e", local: "#a855f7",
  text: "#e8eaf0", textDim: "#6b7280", textMuted: "#3d4452",
  danger: "#ef4444", warning: "#f59e0b", success: "#10b981",
};

const ZONES = [
  "N-II","C-13","C-14","C-26","C-12","C-25","C-28","A-2","N-260",
  "Lleida - Centre","Lleida - Cappont","Lleida - Bal脿fia","Lleida - La Bordeta",
  "Lleida - La Magdalena","Lleida - Partida Alta","Lleida - El Corregidor",
  "Mollerussa","T脿rrega","Balaguer","La Seu d'Urgell","Tremp","Cervera",
  "Les Borges Blanques","Ponts","Artesa de Segre","Sort","Vielha",
  "Pont de Suert","La Pobla de Segur","Isona","Esterri d'脌neu","Rialp",
  "Alcarr脿s","Alguaire","Almacelles","Guissona","Bellpuig","Organy脿",
  "Oliana","Calaf","Arbeca","Rossell贸","Torrefarrera","Torregrossa",
  "Ser貌s","Golm茅s","Verd煤","Llavors铆","Camarasa","Men脿rguens",
  "Aeroport de Lleida","Alfarr脿s","Almenar","Artesa de Lleida",
  "Bellcaire d'Urgell","Bell-lloc d'Urgell","Bellv铆s","Fondarella",
  "La Granadella","La Granja d'Escarp","Maials","Miralcamp","Palau d'Anglesola",
  "Puigverd de Lleida","Sudanell","Sunyer","Torrebesses","Torrent",
  "Vilanova de Segri脿","Vila-sana","Guimer脿","L'Espluga Calba","Preixana",
  "Sant Mart铆 de Riucorb","Vilagrassa","脌ger","Cubells","Os de Balaguer",
  "Santa Linya","Gerri de la Sal","T铆rvia","Montblanc",
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
const MONTHS     = ["Gener","Febrer","Mar莽","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];

const MAP_ZONES = [
  { id:"N-II",            x:45, y:55, r:18, label:"N-II",     lat:41.615, lng:0.620, rKm:15 },
  { id:"C-13",            x:52, y:28, r:14, label:"C-13",     lat:41.850, lng:0.950, rKm:20 },
  { id:"C-14",            x:62, y:35, r:13, label:"C-14",     lat:41.990, lng:1.030, rKm:18 },
  { id:"C-26",            x:68, y:42, r:12, label:"C-26",     lat:41.790, lng:0.810, rKm:15 },
  { id:"A-2",             x:30, y:62, r:16, label:"A-2",      lat:41.580, lng:0.490, rKm:20 },
  { id:"Lleida - Centre", x:50, y:55, r:20, label:"Lleida",   lat:41.614, lng:0.627, rKm:8  },
  { id:"Mollerussa",      x:35, y:65, r:11, label:"Mollr.",   lat:41.625, lng:0.893, rKm:5  },
  { id:"T脿rrega",         x:25, y:72, r:10, label:"T脿rrega",  lat:41.645, lng:1.139, rKm:5  },
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
        <span style={{fontSize:12,color:C.textDim}}>{PT[type]?.label}</span>
        <span style={{fontSize:13,fontWeight:700,color:pct>60?C.danger:pct>35?C.warning:C.success}}>{pct}%</span>
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
      <div style={{fontSize:11,color:C.textDim,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.1em"}}>Probabilitat per hora</div>
      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:56}}>
        {HOURS.map(h=>{
          const v=data[h]||0,isNow=h===now;
          const col=v>0.6?C.danger:v>0.35?C.warning:C.success;
          return(
            <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{width:"100%",height:Math.round(v*48)+2,background:isNow?C.accent:col,borderRadius:"2px 2px 0 0",opacity:isNow?1:0.6,boxShadow:isNow?`0 0 6px ${C.accent}`:"none"}}/>
              {h%6===0&&<span style={{fontSize:8,color:C.textMuted}}>{h}h</span>}
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
      <div style={{position:"absolute",bottom:6,left:8,display:"flex",gap:10,fontSize:10}}>
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

// 鈹�鈹� Pestanya RADAR 鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�
// Gos en estil c貌mic SVG (basat en la foto: pit bull blanc/gris estirat)
function ComicDog({size=120,alert=false}){
  return(
    <svg width={size} height={size*0.75} viewBox="0 0 160 120" style={{filter:alert?"drop-shadow(0 0 12px #ef4444)":"drop-shadow(0 0 6px #f5a62388)"}}>
      <ellipse cx="80" cy="85" rx="55" ry="28" fill="#e8e0d8" stroke="#555" strokeWidth="2.5"/>
      <ellipse cx="48" cy="105" rx="16" ry="9" fill="#e8e0d8" stroke="#555" strokeWidth="2"/>
      <ellipse cx="112" cy="105" rx="16" ry="9" fill="#e8e0d8" stroke="#555" strokeWidth="2"/>
      {[44,50,56].map(x=><line key={x} x1={x} y1="111" x2={x-1} y2="115" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>)}
      {[106,112,118].map(x=><line key={x} x1={x} y1="111" x2={x-1} y2="115" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>)}
      <ellipse cx="80" cy="52" rx="38" ry="34" fill="#ede6dc" stroke="#555" strokeWidth="2.5"/>
      <ellipse cx="80" cy="66" rx="22" ry="14" fill="#d4c8be" stroke="#555" strokeWidth="2"/>
      <ellipse cx="80" cy="60" rx="10" ry="7" fill="#333" stroke="#222" strokeWidth="1"/>
      <ellipse cx="77" cy="58" rx="2.5" ry="1.5" fill="#555" opacity="0.5"/>
      <circle cx="62" cy="46" r="8" fill="white" stroke="#555" strokeWidth="2"/>
      <circle cx="98" cy="46" r="8" fill="white" stroke="#555" strokeWidth="2"/>
      <circle cx="63" cy="47" r="4.5" fill="#7a4a2a"/>
      <circle cx="99" cy="47" r="4.5" fill="#7a4a2a"/>
      <circle cx="64" cy="46" r="1.5" fill="black"/>
      <circle cx="100" cy="46" r="1.5" fill="black"/>
      <circle cx="65" cy="44" r="1" fill="white"/>
      <circle cx="101" cy="44" r="1" fill="white"/>
      <path d={alert?"M54 37 Q62 33 70 37":"M54 40 Q62 37 70 40"} fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round"/>
      <path d={alert?"M90 37 Q98 33 106 37":"M90 40 Q98 37 106 40"} fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round"/>
      <ellipse cx="44" cy="38" rx="12" ry="16" fill="#c8b8a8" stroke="#555" strokeWidth="2" transform="rotate(-15 44 38)"/>
      <ellipse cx="116" cy="38" rx="12" ry="16" fill="#c8b8a8" stroke="#555" strokeWidth="2" transform="rotate(15 116 38)"/>
      {alert?<path d="M68 72 Q80 82 92 72" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round"/>:<path d="M68 72 Q80 78 92 72" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round"/>}
      <ellipse cx="58" cy="78" rx="12" ry="8" fill="#ccc" opacity="0.4"/>
      <ellipse cx="105" cy="82" rx="10" ry="7" fill="#ccc" opacity="0.35"/>
      {alert&&[1,2,3].map(i=>(
        <circle key={i} cx="118" cy="45" r={8+i*11} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity={0.6-i*0.15}>
          <animate attributeName="r" values={`${8+i*11};${16+i*11};${8+i*11}`} dur="1s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values={`${0.6-i*0.15};0;${0.6-i*0.15}`} dur="1s" repeatCount="indefinite"/>
        </circle>
      ))}
      {alert&&<text x="106" y="16" fontSize="11" fill="#ef4444" fontWeight="bold">BORK!</text>}
    </svg>
  );
}

function RadarTab({zoneData}){
  const [active,setActive]=useState(false);
  const [pos,setPos]=useState(null);
  const [err,setErr]=useState(null);
  const [nearby,setNearby]=useState([]);
  const [alert,setAlert]=useState(false);
  const [sound,setSound]=useState(true);
  const [barkActive,setBarkActive]=useState(false);
  const [thresh,setThresh]=useState(0.4);
  const [lastBark,setLastBark]=useState(0);
  const audioRef=useRef(null);
  const watchRef=useRef(null);
  const intervalRef=useRef(null);

  const initAudio=()=>{if(!audioRef.current)audioRef.current=new(window.AudioContext||window.webkitAudioContext)();};

  const stopBark=()=>{
    setBarkActive(false);
    if(intervalRef.current){clearInterval(intervalRef.current);intervalRef.current=null;}
  };

  const startBark=()=>{
    initAudio();
    setBarkActive(true);
    playBark(audioRef.current);
    intervalRef.current=setInterval(()=>playBark(audioRef.current),3000);
    setTimeout(stopBark,30000);
  };

  const check=useCallback((lat,lng)=>{
    const nb=MAP_ZONES.map(z=>({
      ...z,
      dist:Math.round(distKm(lat,lng,z.lat,z.lng)*10)/10,
      prob:zoneData[z.id]||0
    })).filter(z=>z.dist<z.rKm+10).sort((a,b)=>a.dist-b.dist);
    setNearby(nb);
    const danger=nb.find(z=>z.dist<z.rKm&&z.prob>=thresh);
    setAlert(!!danger);
    if(danger&&sound&&!barkActive&&Date.now()-lastBark>15000){
      startBark();
      setLastBark(Date.now());
    }
  },[zoneData,thresh,sound,barkActive,lastBark]);

  const start=()=>{
    initAudio();
    if(!navigator.geolocation){setErr("GPS no disponible");return;}
    setActive(true);setErr(null);
    watchRef.current=navigator.geolocation.watchPosition(
      p=>{setPos({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy});check(p.coords.latitude,p.coords.longitude);},
      e=>{setErr(e.code===1?"Cal permetre l'acc茅s a la ubicaci贸":"Error GPS. Torna a intentar-ho.");setActive(false);},
      {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
    );
  };

  const stop=()=>{
    if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);
    stopBark();
    setActive(false);setPos(null);setNearby([]);setAlert(false);
  };

  useEffect(()=>()=>{
    if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);
    if(intervalRef.current)clearInterval(intervalRef.current);
  },[]);
  useEffect(()=>{if(pos)check(pos.lat,pos.lng);},[zoneData,check]);

  return(
    <div>
      {alert&&(
        <div style={{background:C.danger,borderRadius:12,padding:16,marginBottom:12,textAlign:"center",boxShadow:`0 0 30px ${C.danger}88`,animation:"pulse 0.6s infinite alternate"}}>
          <ComicDog size={90} alert={true}/>
          <div style={{fontSize:18,fontWeight:900,color:"#fff",marginTop:4}}>PATRULLA PROPERA!</div>
          <div style={{fontSize:12,color:"#ffcccc",marginTop:4}}>{nearby.find(z=>z.prob>=thresh)?.id} 路 a {nearby.find(z=>z.prob>=thresh)?.dist} km</div>
          {barkActive&&<button onClick={stopBark} style={{marginTop:10,padding:"8px 20px",background:"#fff",color:C.danger,border:"none",borderRadius:8,fontSize:13,fontWeight:800,cursor:"pointer"}}>馃攪 SILENCIAR</button>}
        </div>
      )}
      <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
          <ComicDog size={130} alert={barkActive}/>
        </div>
        <button onClick={active?stop:start} style={{width:"100%",padding:14,background:active?C.danger:C.success,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:12,boxShadow:active?`0 0 20px ${C.danger}66`:`0 0 20px ${C.success}66`}}>
          {active?"鈴� ATURAR RADAR":"鈻� ACTIVAR RADAR GPS"}
        </button>
        {err&&<div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}`,borderRadius:8,padding:10,fontSize:11,color:C.danger,marginBottom:12}}>鈿� {err}</div>}
        {pos&&<div style={{background:C.bg,borderRadius:8,padding:10,marginBottom:12,fontSize:11}}><div style={{color:C.textDim,marginBottom:3}}>馃搷 GPS actiu 鈥� posici贸 real</div><div style={{color:C.text}}>{pos.lat.toFixed(5)}掳N, {pos.lng.toFixed(5)}掳E</div><div style={{color:C.textDim,marginTop:2}}>Precisi贸: 卤{Math.round(pos.acc)}m</div><div style={{color:C.success,marginTop:2,fontSize:10}}>鉁� Dist脿ncies calculades en temps real</div></div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:12,color:C.textDim}}>馃攰 Lladruc d'alerta</span>
          <div onClick={()=>setSound(p=>!p)} style={{width:44,height:24,borderRadius:12,background:sound?C.accent:C.border,position:"relative",cursor:"pointer",transition:"background 0.2s"}}>
            <div style={{position:"absolute",top:2,left:sound?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
          </div>
        </div>
        {barkActive&&<button onClick={stopBark} style={{width:"100%",padding:10,background:C.border,color:C.text,border:`1px solid ${C.warning}`,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:12}}>馃攪 PARAR LLADRUC</button>}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:C.textDim}}>Llindar d'alerta</span><span style={{fontSize:12,color:C.accent}}>{Math.round(thresh*100)}%</span></div>
          <input type="range" min={10} max={90} value={Math.round(thresh*100)} onChange={e=>setThresh(Number(e.target.value)/100)} style={{width:"100%",accentColor:C.accent}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMuted,marginTop:2}}><span>Sensible</span><span>Estricte</span></div>
        </div>
      </div>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:6}}>鈩� Com funciona el radar</div>
        <div style={{fontSize:10,color:C.textDim,lineHeight:1.7}}>
          <div>鈥� GPS real del m貌bil detecta la teva posici贸</div>
          <div>鈥� Calcula dist脿ncia fins a cada zona de Lleida</div>
          <div>鈥� Si entres a zona amb patrulles reportades 鈫� ALERTA</div>
          <div style={{color:C.warning,marginTop:4}}>鈥� Probabilitats basades en missatges reals dels grups</div>
        </div>
      </div>
      {active&&(
        <div>
          <div style={{fontSize:11,color:C.textDim,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.1em"}}>Zones properes ({nearby.length})</div>
          {nearby.length===0?<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:16,textAlign:"center"}}><div style={{fontSize:12,color:C.textDim}}>Cap zona a prop 路 Esperant GPS...</div></div>
          :nearby.slice(0,6).map((z,i)=>{
            const col=z.prob>0.6?C.danger:z.prob>0.35?C.warning:C.success;
            const isDanger=z.dist<z.rKm&&z.prob>=thresh;
            return(
              <div key={i} style={{background:isDanger?`${C.danger}22`:C.surface,border:`1px solid ${isDanger?C.danger:C.border}`,borderLeft:`3px solid ${col}`,borderRadius:8,padding:"10px 12px",marginBottom:6,boxShadow:isDanger?`0 0 12px ${C.danger}44`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,fontWeight:700,color:C.text}}>{z.id}</span><span style={{fontSize:14,fontWeight:800,color:col}}>{Math.round(z.prob*100)}%</span></div>
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:C.textDim}}>{isDanger?"馃毃":"馃搷"} {z.dist} km de tu</span>{isDanger&&<span style={{fontSize:11,color:C.danger,fontWeight:700}}>鈿� ZONA DE RISC</span>}</div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes pulse{from{transform:scale(1)}to{transform:scale(1.02)}}`}</style>
    </div>
  );
}
// 鈹�鈹� Pestanya ESTAD脥STIQUES 鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�
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
      {/* Gr脿fic per hora */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:10}}>Deteccions per hora</div>
        <div style={{display:"flex",gap:2,alignItems:"flex-end",height:64}}>
          {byHour.map((n,h)=>{
            const isSel=selHour===h,isNow=h===new Date().getHours();
            const col=isNow?C.accent:isSel?C.accent:C.mossos;
            return(
              <div key={h} onClick={()=>setSelHour(selHour===h?-1:h)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer"}}>
                <div style={{width:"100%",height:Math.round((n/maxH)*58)+2,background:col,borderRadius:"2px 2px 0 0",opacity:isSel||isNow?1:0.55,boxShadow:isSel?`0 0 6px ${C.accent}`:"none",transition:"height 0.4s"}}/>
                {h%6===0&&<span style={{fontSize:8,color:C.textMuted}}>{h}h</span>}
              </div>
            );
          })}
        </div>
        {selHour>=0&&<div style={{fontSize:10,color:C.accent,marginTop:6,textAlign:"center"}}>Filtrant per {selHour}:00h 路 {byHour[selHour]} deteccions 鈥� Toca per treure el filtre</div>}
      </div>

      {/* Gr脿fic per dia */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:10}}>Deteccions per dia de la setmana</div>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:64}}>
          {byDay.map((n,d)=>{
            const isSel=selDay===d,isToday=d===new Date().getDay();
            const col=isToday?C.accent:isSel?C.accent:C.guardia;
            return(
              <div key={d} onClick={()=>setSelDay(selDay===d?-1:d)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"}}>
                <div style={{width:"100%",height:Math.round((n/maxD)*52)+2,background:col,borderRadius:"2px 2px 0 0",opacity:isSel||isToday?1:0.55,boxShadow:isSel?`0 0 6px ${C.accent}`:"none",transition:"height 0.4s"}}/>
                <span style={{fontSize:9,color:isSel?C.accent:C.textDim}}>{DAYS_SHORT[d]}</span>
              </div>
            );
          })}
        </div>
        {selDay>=0&&<div style={{fontSize:10,color:C.accent,marginTop:6,textAlign:"center"}}>Filtrant per {DAYS_FULL[selDay]} 路 {byDay[selDay]} deteccions 鈥� Toca per treure el filtre</div>}
      </div>

      {/* Top zones */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:10}}>Zones m茅s actives</div>
        {topZones.length===0?<div style={{fontSize:11,color:C.textDim,textAlign:"center"}}>Sense dades</div>:
        topZones.map(([zone,count],i)=>(
          <div key={i} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:C.text}}>{zone}</span><span style={{fontSize:12,fontWeight:700,color:C.accent}}>{count}</span></div>
            <div style={{height:5,background:C.border,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(count/topZones[0][1])*100}%`,background:C.accent,borderRadius:3}}/></div>
          </div>
        ))}
      </div>

      {/* Per tipus */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:10}}>Per tipus de patrulla</div>
        {Object.entries(typeCount).filter(([,n])=>n>0).map(([type,n])=>(
          <div key={type} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:12,color:PT[type]?.color||C.textDim}}>{PT[type]?.label||type}</span>
            <span style={{fontSize:12,fontWeight:700,color:C.text}}>{n}</span>
          </div>
        ))}
      </div>

      {/* Deteccions filtrades */}
      {(selDay>=0||selHour>=0)&&(
        <div>
          <div style={{fontSize:11,color:C.textDim,marginBottom:8}}>Deteccions filtrades ({filtered.length})</div>
          {filtered.slice(0,10).map((d,i)=>{
            const ptype=PT[d.patrol_type]||PT.unknown;
            const time=d.created_at?new Date(d.created_at).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"??";
            return(
              <div key={i} style={{background:C.bg,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:"8px 10px",marginBottom:4}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:10,color:ptype.color}}>[{ptype.short}] {d.zone_norm||d.zone}</span><span style={{fontSize:10,color:C.accent}}>{time}</span></div>
                {d.raw_message&&<div style={{fontSize:10,color:C.textDim,fontStyle:"italic"}}>"{d.raw_message.substring(0,50)}"</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 鈹�鈹� Pestanya CALENDARI 鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�
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
      {/* Cap莽alera mes */}
      <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <button onClick={prevMonth} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:6,width:32,height:32,cursor:"pointer",fontSize:16}}>鈥�</button>
          <span style={{fontSize:14,fontWeight:700,color:C.accent}}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:6,width:32,height:32,cursor:"pointer",fontSize:16}}>鈥�</button>
        </div>

        {/* Dies de la setmana */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
          {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:C.textDim,padding:"2px 0"}}>{d}</div>)}
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
                <span style={{fontSize:13,color:isToday?C.accent:isSel?C.accent:C.text,fontWeight:isToday||isSel?700:400}}>{day}</span>
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
          <div style={{fontSize:11,color:C.textDim,marginBottom:8}}>
            {selDets.length>0?`${selDets.length} deteccions el ${selDate} de ${MONTHS[month]}`:`Cap detecci贸 el ${selDate} de ${MONTHS[month]}`}
          </div>
          {selDets.length===0?(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:16,textAlign:"center"}}>
              <div style={{fontSize:12,color:C.textDim}}>Dia tranquil 鉁�</div>
            </div>
          ):selDets.map((d,i)=>{
            const ptype=PT[d.patrol_type]||PT.unknown;
            const time=d.created_at?new Date(d.created_at).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"}):"??";
            return(
              <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:12,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:10,color:ptype.color,background:`${ptype.color}22`,padding:"2px 7px",borderRadius:3}}>{ptype.label}</span>
                  <span style={{fontSize:12,color:C.accent,fontWeight:700}}>{time}</span>
                </div>
                <div style={{fontSize:12,color:C.text,marginBottom:4}}>{d.zone_norm||d.zone}</div>
                {d.raw_message&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic",marginBottom:6}}>"{d.raw_message.substring(0,65)}"</div>}
                <div style={{display:"flex",gap:8}}>
                  <span style={{fontSize:10,color:C.textMuted,background:C.border,padding:"2px 6px",borderRadius:3}}>via {d.source?.toUpperCase()}</span>
                  <span style={{fontSize:10,color:d.confidence==="alta"?C.success:d.confidence==="mitja"?C.warning:C.textMuted,background:C.border,padding:"2px 6px",borderRadius:3}}>conf. {d.confidence}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 鈹�鈹� App principal 鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�鈹�
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
  const prevCount=useRef(0);

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

  useEffect(()=>{
    const fetch2=async()=>{
      try{
        const[h,d]=await Promise.all([
          fetch(`${API}/api/health`).then(r=>r.json()).catch(()=>null),
          fetch(`${API}/api/detections?limit=50`).then(r=>r.json()).catch(()=>[]),
        ]);
        if(h)setHealth(h);
        if(Array.isArray(d)){
          if(d.length>prevCount.current&&prevCount.current>0){setNewAlert(d[0]);setTimeout(()=>setNewAlert(null),4000);}
          prevCount.current=d.length;
          setDetections(d);
          const p={...getZoneP()};
          d.forEach(det=>{if(det.zone_norm&&p[det.zone_norm]!==undefined)p[det.zone_norm]=Math.min(1,(p[det.zone_norm]||0)+0.15);});
          setZoneProbs(p);
        }
      }catch(e){setZoneProbs(getZoneP());}
    };
    fetch2();setZoneProbs(getZoneP());
    const t=setInterval(fetch2,15000);return()=>clearInterval(t);
  },[]);

  useEffect(()=>{setHourlyData(getHourly(selectedZone));},[selectedZone]);

  const handleQuery=async()=>{
    try{
      const r=await fetch(`${API}/api/probability?zone=${encodeURIComponent(queryZone)}&hour=${queryHour}`);
      const data=await r.json();
      setQueryResult({...data,pk:queryPK,day:queryDay});
    }catch{setQueryResult({mossos:0,guardia:0,local:0,overall:0,sample_size:0,reliability:"cap dada",pk:queryPK,day:queryDay});}
  };

  const curH=new Date().getHours();
  const curP=zoneProbs[selectedZone]||(hourlyData[curH]||0);
  const filtDets=filterType==="all"?detections:detections.filter(d=>d.patrol_type===filterType);

  const tabs=[
    {id:"dashboard",icon:"鈼�",label:"Mapa"},
    {id:"radar",    icon:"馃悤",label:"Radar"},
    {id:"query",    icon:"鈯�",label:"Consulta"},
    {id:"stats",    icon:"馃搳",label:"Stats"},
    {id:"calendar", icon:"馃搮",label:"Calendari"},
    {id:"history",  icon:"鈮�", label:"Historial"},
    {id:"config",   icon:"鈿�", label:"Config"},
  ];

  const ss={width:"100%",padding:"10px 12px",background:C.bg,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none"};

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column"}}>
      {newAlert&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:C.danger,color:"#fff",padding:"10px 16px",fontSize:12,fontWeight:700,display:"flex",justifyContent:"space-between"}}>
          <span>馃毃 NOVA DETECCI脫: {PT[newAlert.patrol_type]?.short} 路 {newAlert.zone_norm}</span>
          <span style={{opacity:0.8}}>{newAlert.source?.toUpperCase()}</span>
        </div>
      )}

      {/* Header */}
      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:newAlert?40:0}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.accent,boxShadow:`0 0 8px ${C.accent}`}}/>
            <span style={{fontSize:15,fontWeight:700,letterSpacing:"0.05em",color:C.accent}}>PATROL<span style={{color:C.textDim}}>TRACK</span></span>
            <span style={{fontSize:10,color:C.textDim,background:C.border,padding:"2px 7px",borderRadius:4}}>Lleida 路 BETA</span>
          </div>
          <div style={{fontSize:10,color:C.textMuted,marginTop:2}}>
            {sources.telegram&&"鈼� TG"}{" "}{sources.whatsapp&&"鈼� WA"} 路 {health?`${health.total} dets 路 24h:${health.last_24h}`:"Connectant..."}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:18,fontWeight:700}}>{new Date().toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"})}</div>
          <div style={{fontSize:10,color:C.textDim}}>{new Date().toLocaleDateString("ca-ES",{weekday:"short",day:"numeric",month:"short"})}</div>
        </div>
      </div>

      <div style={{flex:1,padding:"12px 12px 76px",overflowY:"auto"}}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <MapSVG zoneData={zoneProbs} onSelect={setSelectedZone} selected={selectedZone}/>
            <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div><div style={{fontSize:13,fontWeight:700}}>{selectedZone}</div><div style={{fontSize:11,color:C.textDim,marginTop:2}}>Ara 路 {curH}:00h</div></div>
                <div style={{fontSize:22,fontWeight:800,color:curP>0.6?C.danger:curP>0.35?C.warning:C.success}}>{Math.round(curP*100)}%</div>
              </div>
              <ProbBar value={curP*0.7} type="mossos"/>
              <ProbBar value={curP*0.4} type="guardia"/>
              <ProbBar value={curP*0.2} type="local"/>
              <HourlyChart data={hourlyData}/>
            </div>
            <div style={{fontSize:11,color:C.textDim,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.1em"}}>脷ltimes deteccions</div>
            {detections.length===0?(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:20,textAlign:"center"}}>
                <div style={{fontSize:12,color:C.textDim}}>Sense deteccions encara</div>
                <div style={{fontSize:11,color:C.accent,marginTop:8}}>"Mossos a la N-II km 45, cuidado"</div>
              </div>
            ):detections.slice(0,4).map((d,i)=>{
              const ptype=PT[d.patrol_type]||PT.unknown;
              const time=d.created_at?new Date(d.created_at).toLocaleTimeString("ca-ES",{hour:"2-digit",minute:"2-digit"}):"??:??";
              return(
                <div key={i} onClick={()=>setSelectedZone(d.zone_norm)} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:10,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"1px 6px",borderRadius:3}}>{ptype.short}</span>
                      <span style={{fontSize:11,color:C.textDim}}>{d.zone_norm||d.zone}</span>
                    </div>
                    <span style={{fontSize:11,color:C.accent}}>{time}</span>
                  </div>
                  {d.raw_message&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic"}}>"{d.raw_message.substring(0,55)}"</div>}
                </div>
              );
            })}
          </div>
        )}

        {tab==="radar"&&<RadarTab zoneData={zoneProbs}/>}
        {tab==="stats"&&<StatsTab detections={detections}/>}
        {tab==="calendar"&&<CalendarTab detections={detections}/>}

        {/* QUERY */}
        {tab==="query"&&(
          <div>
            <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:C.accent}}>Consulta de probabilitat</div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:C.textDim,display:"block",marginBottom:5}}>Zona / Municipi</label>
                <select value={queryZone} onChange={e=>setQueryZone(e.target.value)} style={ss}>{ZONES.map(z=><option key={z} value={z}>{z}</option>)}</select>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:C.textDim,display:"block",marginBottom:5}}>Punt Quilom猫tric (opcional)</label>
                <input type="text" value={queryPK} onChange={e=>setQueryPK(e.target.value)} placeholder="ex: km 45" style={{...ss,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:C.textDim,display:"block",marginBottom:5}}>Dia de la setmana</label>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {DAYS_FULL.map((day,i)=>(
                    <button key={i} onClick={()=>setQueryDay(i)} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${queryDay===i?C.accent:C.border}`,background:queryDay===i?C.accentDim:"transparent",color:queryDay===i?C.accent:C.textDim,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
                      {day.substring(0,3)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,color:C.textDim,display:"block",marginBottom:5}}>Hora 鈥� {queryHour}:00h</label>
                <input type="range" min={0} max={23} value={queryHour} onChange={e=>setQueryHour(Number(e.target.value))} style={{width:"100%",accentColor:C.accent}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMuted,marginTop:3}}><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
              </div>
              <button onClick={handleQuery} style={{width:"100%",padding:12,background:C.accent,color:"#000",border:"none",borderRadius:8,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>CONSULTAR</button>
            </div>
            {queryResult&&(
              <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
                <div style={{textAlign:"center",marginBottom:14}}>
                  <div style={{fontSize:11,color:C.textDim,marginBottom:4}}>{queryZone}{queryResult.pk?` 路 ${queryResult.pk}`:""} 路 {DAYS_FULL[queryResult.day]} 路 {queryHour}:00h</div>
                  <div style={{fontSize:64,fontWeight:900,lineHeight:1,color:(queryResult.overall||0)>0.6?C.danger:(queryResult.overall||0)>0.35?C.warning:C.success,textShadow:"0 0 30px currentColor"}}>{Math.round((queryResult.overall||0)*100)}%</div>
                  <div style={{fontSize:12,color:C.textDim,marginTop:4}}>probabilitat de patrulla</div>
                </div>
                <div style={{background:C.bg,borderRadius:8,padding:12}}>
                  <ProbBar value={queryResult.mossos} type="mossos"/>
                  <ProbBar value={queryResult.guardia} type="guardia"/>
                  <ProbBar value={queryResult.local} type="local"/>
                </div>
                <div style={{marginTop:10,padding:10,background:C.accentDim,borderRadius:8,border:`1px solid ${C.accentGlow}`}}>
                  <div style={{fontSize:11,color:C.accent,fontWeight:700}}>{(queryResult.overall||0)>0.6?"鈿� Alta probabilitat":(queryResult.overall||0)>0.35?"鈼� Probabilitat moderada":"鉁� Baixa probabilitat"}</div>
                  <div style={{fontSize:11,color:C.textDim,marginTop:4}}>Basat en {queryResult.sample_size||0} registres 路 Fiabilitat: {queryResult.reliability||"baixa"}</div>
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
                <button key={k} onClick={()=>setFilterType(k)} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${filterType===k?C.accent:C.border}`,background:filterType===k?C.accentDim:"transparent",color:filterType===k?C.accent:C.textDim,fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:11,color:C.textDim,marginBottom:8}}>{filtDets.length} registres</div>
            {filtDets.length===0?(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:20,textAlign:"center"}}><div style={{fontSize:12,color:C.textDim}}>Sense deteccions</div></div>
            ):filtDets.map((d,i)=>{
              const ptype=PT[d.patrol_type]||PT.unknown;
              const time=d.created_at?new Date(d.created_at).toLocaleString("ca-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"??";
              return(
                <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:12,marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"2px 7px",borderRadius:3}}>{ptype.label}</span><span style={{fontSize:12,color:C.accent,fontWeight:700}}>{time}</span></div>
                  <div style={{fontSize:12,color:C.text,marginBottom:4}}>{d.zone_norm||d.zone}{d.pk&&<span style={{color:C.warning,marginLeft:8}}>{d.pk}</span>}</div>
                  {d.raw_message&&<div style={{fontSize:11,color:C.textDim,fontStyle:"italic",marginBottom:6}}>"{d.raw_message.substring(0,70)}"</div>}
                  <div style={{display:"flex",gap:8}}>
                    <span style={{fontSize:10,color:C.textMuted,background:C.border,padding:"2px 6px",borderRadius:3}}>via {d.source?.toUpperCase()}</span>
                    <span style={{fontSize:10,color:d.confidence==="alta"?C.success:d.confidence==="mitja"?C.warning:C.textMuted,background:C.border,padding:"2px 6px",borderRadius:3}}>conf. {d.confidence}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CONFIG */}
        {tab==="config"&&(
          <div>
            <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:C.accent}}>Fonts de dades</div>
              {[{key:"telegram",label:"Telegram",icon:"鉁�",status:"Configurat 路 en espera",sc:C.warning},{key:"whatsapp",label:"WhatsApp",icon:"鈼�",status:"Connectat via Web",sc:C.success}].map(s=>(
                <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{s.icon}</div>
                    <div><div style={{fontSize:13,fontWeight:600}}>{s.label}</div><div style={{fontSize:11,color:s.sc}}>{s.status}</div></div>
                  </div>
                  <div onClick={()=>setSources(p=>({...p,[s.key]:!p[s.key]}))} style={{width:44,height:24,borderRadius:12,background:sources[s.key]?C.accent:C.border,position:"relative",cursor:"pointer",transition:"background 0.2s"}}>
                    <div style={{position:"absolute",top:2,left:sources[s.key]?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:C.accent}}>Estat del sistema</div>
              {[{label:"Backend API",value:health?"En l铆nia":"Fora de l铆nia",ok:!!health},{label:"Base de dades",value:health?`${health.total} registres`:"鈥�",ok:!!health},{label:"脷ltima 24h",value:health?`${health.last_24h} deteccions`:"鈥�",ok:true}].map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12,color:C.textDim}}>{s.label}</span>
                  <span style={{fontSize:12,color:s.ok?C.success:C.danger,fontWeight:600}}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",padding:"6px 0 10px",overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"0 0 auto",minWidth:50,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 8px"}}>
            <span style={{fontSize:tab===t.id?20:17,color:tab===t.id?C.accent:C.textMuted}}>{t.icon}</span>
            <span style={{fontSize:9,color:tab===t.id?C.accent:C.textMuted,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
