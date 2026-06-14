import { useState, useEffect, useRef } from "react";
import MapTab from "./MapTab";
import ZoneMap from "./ZoneMap";
import { THEMES, ThemeContext, useC } from "./lib/themes";
import { API, ZONES, MAP_ZONES, ptWith, DAYS_FULL, MONTHS } from "./lib/constants";
import { computeZoneProbs, computeHourly } from "./lib/utils";
import { useRadar } from "./lib/useRadar";
import Splash from "./components/Splash";
import RadarTab from "./tabs/RadarTab";
import StatsTab from "./tabs/StatsTab";

// PT amb colors del tema fallback — només per a ProbBar (no està embolcallat pel Provider).
// Els tabs que usen useC reconstrueixen PT amb el tema actiu via ptWith(C).
const PT = ptWith(THEMES.normal);

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
  const [showToken,setShowToken]=useState(false);
  const [tokenCopied,setTokenCopied]=useState(false);
  const [cmdCopied,setCmdCopied]=useState(false);
  const [configCopied,setConfigCopied]=useState(false);
  // Estat del test del token: null=no provat, "ok"=acceptat, "wrong"=rebutjat, "err"=xarxa, "testing"=loading
  const [tokenTest,setTokenTest]=useState(null);
  const [tokenTestMsg,setTokenTestMsg]=useState("");
  // Fingerprint que el servidor té al INGEST_TOKEN. Es carrega automàticament
  // quan el test falla, per veure si coincideix amb el del navegador.
  const [serverFp,setServerFp]=useState(null);
  // Fingerprint del token actual del navegador (mateix format: 4 primers + … + 4 últims)
  const browserFp = apiToken && apiToken.length >= 8
    ? `${apiToken.substring(0,4)}…${apiToken.substring(apiToken.length-4)}`
    : null;

  // Genera un token nou de 64 caràcters hex (256 bits) via Web Crypto API.
  // Es desa al localStorage automàticament. L'usuari haurà de plantar-lo al
  // worker amb `npx wrangler secret put INGEST_TOKEN`.
  const generateNewToken=()=>{
    const arr=new Uint8Array(32);
    crypto.getRandomValues(arr);
    const hex=Array.from(arr).map(b=>b.toString(16).padStart(2,"0")).join("");
    setApiToken(hex);
    setShowToken(true);
    // Auto-copia per facilitar el setup
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(hex).then(()=>{
        setTokenCopied(true);
        setTimeout(()=>setTokenCopied(false),2500);
      }).catch(()=>{});
    }
  };
  const copyToken=()=>{
    if(!apiToken)return;
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(apiToken).then(()=>{
        setTokenCopied(true);
        setTimeout(()=>setTokenCopied(false),2500);
      }).catch(()=>{});
    }
  };
  // Helper genèric per copiar al porta-retalls i mostrar feedback
  const copyToClipboard=(text,setFlag)=>{
    if(!text||!navigator.clipboard||!navigator.clipboard.writeText)return;
    navigator.clipboard.writeText(text).then(()=>{
      setFlag(true);
      setTimeout(()=>setFlag(false),2500);
    }).catch(()=>{});
  };
  // Prova que el token actual estigui acceptat pel worker. Envia un missatge
  // de prova que NO serà classificat com a patrulla; si el token val tornarà
  // ok:true,stored:false. Si no val tornarà 401.
  const testToken=async()=>{
    if(!apiToken){setTokenTest("wrong");setTokenTestMsg("Primer configura un token al pas 1");return;}
    setTokenTest("testing");setTokenTestMsg("");setServerFp(null);
    try{
      const r=await fetch(`${API}/api/ingest`,{
        method:"POST",
        headers:{"content-type":"application/json","x-ingest-token":apiToken},
        body:JSON.stringify({message:"ping de prova patroltrack",group_name:"test-config",source:"test"}),
      });
      if(r.status===401){
        setTokenTest("wrong");
        setTokenTestMsg("El servidor té un token diferent del que tens al navegador.");
        // Carrega el fingerprint del servidor per ajudar a diagnosticar
        try{
          const fr=await fetch(`${API}/api/ingest-fingerprint`);
          if(fr.ok){const fd=await fr.json();if(fd&&fd.ok)setServerFp(fd);}
        }catch{}
        return;
      }
      const data=await r.json().catch(()=>null);
      if(r.ok&&data&&data.ok){
        setTokenTest("ok");
        setTokenTestMsg("Tot correcte. Ja pots passar al pas 4.");
      }else{
        setTokenTest("err");
        setTokenTestMsg(`Resposta inesperada: ${data?.reason||`HTTP ${r.status}`}`);
      }
    }catch(e){
      setTokenTest("err");
      setTokenTestMsg(`Error de xarxa: ${e.message||e}`);
    }
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

  // Diagnòstic Telegram
  const [tgStatus,setTgStatus]=useState(null);
  const [tgLoading,setTgLoading]=useState(false);
  const [tgRepairing,setTgRepairing]=useState(false);
  const [tgRepairMsg,setTgRepairMsg]=useState(null);
  const checkTelegramStatus=async()=>{
    setTgLoading(true);
    try{
      const r=await fetch(`${API}/api/telegram-status`,{cache:"no-store"});
      const data=await r.json();
      setTgStatus(data);
    }catch(e){
      setTgStatus({ok:false,reason:e.message||"Error de xarxa"});
    }finally{setTgLoading(false);}
  };
  // Registra/repara el webhook de Telegram (el worker s'apunta a si mateix).
  const repairTelegramWebhook=async()=>{
    setTgRepairing(true);setTgRepairMsg(null);
    try{
      const r=await fetch(`${API}/api/telegram-setup`,{method:"POST",cache:"no-store"});
      const data=await r.json();
      if(data.ok){
        setTgRepairMsg({ok:true,text:"✓ Webhook registrat. Envia un missatge de prova al grup i torna a comprovar."});
      }else{
        setTgRepairMsg({ok:false,text:`✗ ${data.error||data.reason||"No s'ha pogut registrar"}`});
      }
      await checkTelegramStatus();
    }catch(e){
      setTgRepairMsg({ok:false,text:`✗ Error de xarxa: ${e.message||e}`});
    }finally{setTgRepairing(false);}
  };

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

  // Probabilitat per zona basada en deteccions REALS (no sintètic).
  // Norma per la zona més activa per tenir valors 0-1.
  const computeZoneProbs=(dets)=>{
    const counts={};
    MAP_ZONES.forEach(z=>{counts[z.id]=0;});
    const cutoff=Date.now()-7*24*3600*1000; // setmana
    for(const d of dets){
      const ts=d.created_at?new Date(d.created_at).getTime():0;
      if(ts<cutoff)continue;
      const z=d.zone_norm||d.zone;
      if(z in counts)counts[z]++;
    }
    const max=Math.max(1,...Object.values(counts));
    const p={};
    for(const k in counts) p[k]=counts[k]/max;
    return p;
  };

  // Distribució per hora de les deteccions d'una zona (per al gràfic del dashboard)
  const computeHourly=(dets,zone)=>{
    const out=Array(24).fill(0);
    for(const d of dets){
      if((d.zone_norm||d.zone)!==zone)continue;
      if(!d.created_at)continue;
      out[new Date(d.created_at).getHours()]++;
    }
    const max=Math.max(1,...out);
    const norm={};
    for(let h=0;h<24;h++)norm[h]=out[h]/max;
    return norm;
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
          setZoneProbs(computeZoneProbs(d));
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


  // Mode de mapa: "schema" (cercles SVG, robust, per defecte) o "tiles" (OSM/Leaflet)
  const [mapMode,setMapMode]=useState(()=>{
    try{return localStorage.getItem("pt_map_mode")||"schema";}catch{return "schema";}
  });
  useEffect(()=>{try{localStorage.setItem("pt_map_mode",mapMode);}catch{}},[mapMode]);

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
  const curP=zoneProbs[selectedZone]||0;
  const filtDets=filterType==="all"?detections:detections.filter(d=>d.patrol_type===filterType);

  // Dades reals per al Dashboard
  const zoneDets=detections.filter(d=>(d.zone_norm||d.zone)===selectedZone);
  const hourly=computeHourly(detections,selectedZone);
  // Comptadors per tipus a aquesta zona
  const zoneByType={mossos:0,guardia:0,local:0,unknown:0};
  zoneDets.forEach(d=>{zoneByType[d.patrol_type]=(zoneByType[d.patrol_type]||0)+1;});

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


        {/* DASHBOARD — dades REALS de la BD */}
        {tab==="dashboard"&&(()=>{
          const now=new Date();
          const cutoff24=Date.now()-24*3600*1000;
          const last24=detections.filter(d=>d.created_at&&new Date(d.created_at).getTime()>=cutoff24);
          // Top 5 zones reals últimes 24h
          const zoneCount={};
          for(const d of last24){const z=d.zone_norm||d.zone||"?";zoneCount[z]=(zoneCount[z]||0)+1;}
          const topZones=Object.entries(zoneCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
          const hourlyVals=Object.values(hourly);
          const hourlyMax=Math.max(...hourlyVals);
          return(
            <div>
              {/* Resum global 24h */}
              <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
                  <span style={{fontSize:13,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>Activitat 24h</span>
                  <span style={{fontSize:22,fontWeight:800,color:last24.length>5?C.danger:last24.length>2?C.warning:C.success}}>{last24.length}</span>
                </div>
                {topZones.length===0?(
                  <div style={{fontSize:13,color:C.textDim,textAlign:"center",padding:"8px 0"}}>Cap detecció a les últimes 24h</div>
                ):(
                  <div>
                    <div style={{fontSize:11,color:C.textMuted,marginBottom:6}}>Zones més actives</div>
                    {topZones.map(([z,n])=>(
                      <div key={z} onClick={()=>setSelectedZone(z)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",cursor:"pointer",borderRadius:4}}>
                        <span style={{fontSize:14,color:z===selectedZone?C.accent:C.text,fontWeight:z===selectedZone?700:500}}>{z}</span>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <div style={{height:5,width:60,background:C.border,borderRadius:3,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${(n/topZones[0][1])*100}%`,background:C.accent,borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:13,color:C.accent,fontWeight:700,minWidth:18,textAlign:"right"}}>{n}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zona seleccionada — dades reals */}
              <div onClick={()=>setZoneDetail(selectedZone)} style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:10,cursor:"pointer",position:"relative"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:11,color:C.textDim,letterSpacing:"0.05em",marginBottom:2}}>ZONA SELECCIONADA</div>
                    <div style={{fontSize:18,fontWeight:700,color:C.accent}}>{selectedZone}</div>
                    <div style={{fontSize:12,color:C.textDim,marginTop:2}}>{zoneDets.length} deteccions registrades · <span style={{color:C.accent}}>toca per detall</span></div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                    <div style={{fontSize:22,fontWeight:800,color:curP>0.6?C.danger:curP>0.35?C.warning:C.success}}>{Math.round(curP*100)}%</div>
                    <div style={{fontSize:10,color:C.textMuted}}>relativa setm.</div>
                  </div>
                </div>

                {/* Per tipus REAL */}
                <div style={{display:"flex",gap:6,marginBottom:zoneDets.length>0?10:0,flexWrap:"wrap"}}>
                  {Object.entries(zoneByType).filter(([,n])=>n>0).map(([t,n])=>{
                    const pt=PT[t]||PT.unknown;
                    return(<div key={t} style={{background:`${pt.color}22`,color:pt.color,padding:"3px 8px",borderRadius:5,fontSize:12,fontWeight:700}}>{pt.short} · {n}</div>);
                  })}
                </div>

                {/* Histograma d'hores REAL */}
                {zoneDets.length>0&&hourlyMax>0&&(
                  <div>
                    <div style={{fontSize:11,color:C.textDim,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.08em"}}>Distribució per hora · històric</div>
                    <div style={{display:"flex",gap:2,alignItems:"flex-end",height:42,background:C.bg,padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`}}>
                      {Array.from({length:24},(_,h)=>{
                        const v=hourly[h]||0;
                        const isNow=h===curH;
                        const col=v>0.66?C.danger:v>0.33?C.warning:C.success;
                        return(<div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                          <div title={`${h}h`} style={{width:"100%",height:Math.round(v*32)+2,background:isNow?C.accent:(v>0?col:C.border),opacity:v>0||isNow?(isNow?1:0.85):0.25,borderRadius:"2px 2px 0 0",boxShadow:isNow?`0 0 4px ${C.accent}`:"none"}}/>
                          {h%6===0&&<span style={{fontSize:8,color:C.textMuted}}>{h}</span>}
                        </div>);
                      })}
                    </div>
                  </div>
                )}
                {zoneDets.length===0&&(
                  <div style={{fontSize:12,color:C.textMuted,fontStyle:"italic"}}>Cap detecció encara en aquesta zona</div>
                )}
              </div>

              {/* Últimes deteccions globals */}
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
                  <div key={i} onClick={()=>setSelectedDet(d)} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${ptype.color}`,borderRadius:8,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",minWidth:0,flex:1}}>
                        <span style={{fontSize:12,fontWeight:700,color:ptype.color,background:`${ptype.color}22`,padding:"1px 6px",borderRadius:3,flexShrink:0}}>{ptype.short}</span>
                        <span style={{fontSize:13,color:C.textDim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.zone_norm||d.zone}</span>
                      </div>
                      <span style={{fontSize:13,color:C.accent,flexShrink:0}}>{time}</span>
                    </div>
                    {d.raw_message&&<div style={{fontSize:13,color:C.textDim,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{d.raw_message.substring(0,55)}"</div>}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {tab==="osm"&&(
          <div>
            {/* Toggle tipus de mapa */}
            <div style={{display:"flex",gap:6,marginBottom:8,background:C.surface,padding:4,borderRadius:10,border:`1px solid ${C.border}`}}>
              {[["schema","◎ Esquema"],["tiles","🗺 Mapa real"]].map(([k,l])=>(
                <button key={k} onClick={()=>setMapMode(k)} style={{flex:1,padding:"9px 8px",borderRadius:8,border:"none",background:mapMode===k?C.accent:"transparent",color:mapMode===k?C.bg:C.textDim,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{l}</button>
              ))}
            </div>
            <div style={{height:"calc(100dvh - 230px)",minHeight:480,maxHeight:"calc(100vh - 180px)"}}>
              {mapMode==="schema"?(
                <ZoneMap
                  zones={MAP_ZONES}
                  probs={zoneProbs}
                  selected={selectedZone}
                  onSelect={setSelectedZone}
                  detections={detections}
                  theme={currentTheme}
                  radarPos={radar.active?radar.pos:null}
                />
              ):(
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
              )}
            </div>
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

            {/* 🔧 ASSISTENT — Configurar reports i WhatsApp en 4 passos */}
            {(()=>{
              // Estats per al wizard (derivats)
              const step1Done = !!apiToken;                                  // token al navegador
              const step3Done = tokenTest === "ok";                          // backend l'accepta
              const wrangerCmd = "cd cloudflare && npx wrangler secret put INGEST_TOKEN";
              const apiBase = API || "https://patroltrack-api.patroltrack.workers.dev";
              const httpShortcutsConfig = `${apiBase}/api/ingest`;
              const httpBody = `{"message":"%s","source":"whatsapp","group_name":"WhatsApp"}`;
              // Activitat WhatsApp — comptem deteccions amb source "whatsapp" i la més recent.
              // Si n'hi ha ≥1, el pas 4 es marca com a fet (cercle verd).
              const whatsappDets = detections.filter(d=>d.source==="whatsapp");
              const whatsappCount = whatsappDets.length;
              const whatsappLatestTs = whatsappDets.reduce((acc,d)=>{
                const t = d.created_at ? new Date(d.created_at).getTime() : 0;
                return t>acc ? t : acc;
              },0);
              const step4Done = whatsappCount > 0;
              // Format relatiu "fa Xh" / "fa Xd" / etc.
              const fmtRel = (ts)=>{
                if(!ts)return"";
                const s = Math.max(0, Math.floor((Date.now()-ts)/1000));
                if(s<60)return"ara mateix";
                if(s<3600)return`fa ${Math.floor(s/60)} min`;
                if(s<86400)return`fa ${Math.floor(s/3600)} h`;
                return`fa ${Math.floor(s/86400)} d`;
              };
              // Estil reusable per a les targetes de pas
              const stepCard = (n,title,done,disabled,children)=>(
                <div style={{
                  background:disabled?`${C.surface}88`:C.surface,
                  borderRadius:12,padding:14,
                  border:`1px solid ${done?C.success:C.border}`,
                  marginBottom:10,
                  opacity:disabled?0.55:1,
                  transition:"all .2s",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:children?10:0}}>
                    <div style={{
                      width:28,height:28,borderRadius:"50%",flexShrink:0,
                      background:done?C.success:disabled?C.border:C.accent,
                      color:done||!disabled?C.bg:C.textDim,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:14,fontWeight:800,fontFamily:"inherit",
                    }}>{done?"✓":n}</div>
                    <div style={{fontSize:15,fontWeight:700,color:done?C.success:disabled?C.textDim:C.text,flex:1}}>{title}</div>
                  </div>
                  {children}
                </div>
              );
              return(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8,paddingLeft:4}}>
                    🛠 Assistent · Reports manuals i WhatsApp
                  </div>

                  {/* PAS 1 — Token al navegador */}
                  {stepCard(1,"Crear el teu token secret",step1Done,false,(<>
                    <div style={{fontSize:12,color:C.textDim,marginBottom:10,lineHeight:1.5}}>
                      Aquest token és una contrasenya que protegeix el teu backend perquè ningú més no et pugui omplir l'app de deteccions falses. Es guarda només al teu navegador.
                    </div>
                    {!apiToken?(
                      <button onClick={generateNewToken} style={{width:"100%",padding:"14px",background:C.accent,color:C.bg,border:"none",borderRadius:10,fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 0 16px ${C.accent}55`}}>
                        ✨ Generar el meu token
                      </button>
                    ):(<>
                      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontFamily:"monospace",fontSize:12,color:C.text,wordBreak:"break-all",marginBottom:8}}>
                        {showToken?apiToken:"•".repeat(Math.min(apiToken.length,48))}
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button onClick={()=>setShowToken(v=>!v)} style={{flex:"1 1 90px",padding:"8px 10px",background:"transparent",color:C.text,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {showToken?"🙈 Amagar":"👁 Veure"}
                        </button>
                        <button onClick={copyToken} style={{flex:"1 1 90px",padding:"8px 10px",background:tokenCopied?C.success:"transparent",color:tokenCopied?"#fff":C.text,border:`1px solid ${tokenCopied?C.success:C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                          {tokenCopied?"✓ Copiat":"📋 Copiar"}
                        </button>
                        <button onClick={generateNewToken} style={{flex:"1 1 110px",padding:"8px 10px",background:"transparent",color:C.warning,border:`1px solid ${C.warning}66`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          🔄 Generar nou
                        </button>
                      </div>
                      <div style={{fontSize:11,color:C.success,marginTop:8}}>✓ Token guardat al navegador ({apiToken.length} caràcters)</div>
                    </>)}
                  </>))}

                  {/* PAS 2 — Plantar al servidor (només si pas 1 fet) */}
                  {stepCard(2,"Dir-li el token al servidor",false,!step1Done,(<>
                    <div style={{fontSize:12,color:C.textDim,marginBottom:10,lineHeight:1.5}}>
                      El servidor (Cloudflare Worker) ha de saber el mateix token que tu. Cal fer-ho un sol cop des d'un terminal del Mac.
                    </div>
                    <div style={{fontSize:12,color:C.text,marginBottom:6}}><b>1.</b> Copia aquesta comanda:</div>
                    <div style={{display:"flex",gap:6,marginBottom:10}}>
                      <div style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontFamily:"monospace",fontSize:11,color:C.text,wordBreak:"break-all"}}>
                        {wrangerCmd}
                      </div>
                      <button onClick={()=>copyToClipboard(wrangerCmd,setCmdCopied)} style={{padding:"10px 12px",background:cmdCopied?C.success:C.accent,color:cmdCopied?"#fff":C.bg,border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,transition:"all .15s",minWidth:80}}>
                        {cmdCopied?"✓ Fet":"📋 Copiar"}
                      </button>
                    </div>
                    <div style={{fontSize:12,color:C.text,marginBottom:6,lineHeight:1.5}}>
                      <b>2.</b> Obre el Terminal del Mac (Cmd+Espai → "Terminal"), enganxa la comanda dins la carpeta del projecte i prem Enter.
                    </div>
                    <div style={{fontSize:12,color:C.text,marginBottom:6,lineHeight:1.5}}>
                      <b>3.</b> Et demanarà el token. Toca <b>📋 Copiar</b> del pas 1, ve al Terminal, enganxa'l (Cmd+V) i prem Enter.
                    </div>
                    <div style={{fontSize:11,color:C.textMuted,marginTop:8,fontStyle:"italic"}}>
                      Quan vegis "Success! Uploaded secret for service patroltrack-api", passa al pas 3 per comprovar-ho.
                    </div>
                  </>))}

                  {/* PAS 3 — Provar (només si pas 1 fet) */}
                  {stepCard(3,"Comprovar que tot funciona",step3Done,!step1Done,(<>
                    <div style={{fontSize:12,color:C.textDim,marginBottom:10,lineHeight:1.5}}>
                      Envia una crida de prova al backend per confirmar que reconeix el teu token. Si fa mesos has fet el pas 2, no l'has de tornar a fer.
                    </div>
                    <button onClick={testToken} disabled={tokenTest==="testing"} style={{width:"100%",padding:"12px",background:tokenTest==="testing"?C.border:tokenTest==="ok"?C.success:tokenTest==="wrong"||tokenTest==="err"?C.danger:C.accent,color:tokenTest==="testing"?C.textDim:tokenTest==="ok"||tokenTest==="wrong"||tokenTest==="err"?"#fff":C.bg,border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:tokenTest==="testing"?"wait":"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                      {tokenTest==="testing"?"⏳ Comprovant…":tokenTest==="ok"?"✓ Funciona — prova un altre cop":"▶ Provar ara"}
                    </button>
                    {tokenTestMsg&&(
                      <div style={{marginTop:8,padding:"10px 12px",borderRadius:8,fontSize:12,lineHeight:1.5,
                        background:tokenTest==="ok"?`${C.success}22`:`${C.danger}22`,
                        border:`1px solid ${tokenTest==="ok"?C.success:C.danger}55`,
                        color:tokenTest==="ok"?C.success:C.danger}}>
                        {tokenTest==="ok"?"✓ ":"✗ "}{tokenTestMsg}
                      </div>
                    )}

                    {/* Comparació visual quan el servidor rebutja */}
                    {tokenTest==="wrong"&&serverFp&&(
                      <div style={{marginTop:8,padding:"12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8}}>
                        <div style={{fontSize:11,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>🔍 Diagnòstic</div>
                        <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                            <span style={{color:C.textDim}}>📱 Al teu navegador</span>
                            <span style={{fontFamily:"monospace",color:C.text,background:C.surface,padding:"2px 8px",borderRadius:4,fontWeight:700}}>{browserFp||"(buit)"}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                            <span style={{color:C.textDim}}>☁ Al servidor</span>
                            <span style={{fontFamily:"monospace",color:C.text,background:C.surface,padding:"2px 8px",borderRadius:4,fontWeight:700}}>
                              {serverFp.configured?serverFp.fingerprint:"(no configurat)"}
                            </span>
                          </div>
                        </div>
                        <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:12,color:C.text,lineHeight:1.5}}>
                          {!serverFp.configured?(
                            <>El servidor no té cap token configurat. Has d'executar la comanda del <b>pas 2</b>.</>
                          ):browserFp===serverFp.fingerprint?(
                            <>Els fingerprints semblen iguals però el token complet no coincideix. Pot ser per espais o salts de línia al pegar. <b>Torna a fer el pas 2</b> amb cura.</>
                          ):(
                            <><b style={{color:C.warning}}>Són diferents</b> → tens un token al navegador que mai no has plantat al servidor. <br/>
                            <b>Solució A</b> (recomanada): copia el token del pas 1 i torna a fer el pas 2 al Terminal. <br/>
                            <b>Solució B</b>: si vols mantenir el token del servidor (<code style={{fontSize:11,background:C.surface,padding:"1px 4px",borderRadius:3}}>{serverFp.fingerprint}</code>), enganxa el seu valor complet al camp del pas 1 (l'has de tenir guardat d'algun lloc).</>
                          )}
                        </div>
                      </div>
                    )}
                  </>))}

                  {/* PAS 4 — WhatsApp (només si pas 3 fet) */}
                  {stepCard(4,"Reenviar des de WhatsApp (opcional)",step4Done,!step3Done&&!step4Done,(<>
                    {/* Pill d'estat de connectivitat: viu si arriben deteccions WhatsApp */}
                    <div style={{
                      display:"flex",alignItems:"center",gap:8,
                      padding:"8px 12px",borderRadius:8,marginBottom:10,
                      background:step4Done?`${C.success}18`:`${C.border}55`,
                      border:`1px solid ${step4Done?C.success+"66":C.border}`,
                      fontSize:12,lineHeight:1.4,
                    }}>
                      <span style={{
                        width:8,height:8,borderRadius:"50%",flexShrink:0,
                        background:step4Done?C.success:C.textMuted,
                        boxShadow:step4Done?`0 0 6px ${C.success}`:"none",
                      }}/>
                      <span style={{color:step4Done?C.success:C.textDim,flex:1}}>
                        {step4Done?(<>
                          <b>WhatsApp connectat</b> — {whatsappCount} missatge{whatsappCount===1?"":"s"} rebut{whatsappCount===1?"":"s"}
                          {whatsappLatestTs?(<> · últim {fmtRel(whatsappLatestTs)}</>):null}
                        </>):(
                          <>Esperant el primer missatge des de WhatsApp…</>
                        )}
                      </span>
                    </div>

                    <div style={{fontSize:12,color:C.textDim,marginBottom:10,lineHeight:1.5}}>
                      WhatsApp no et pot enviar missatges directament a l'app (no té bots oberts com Telegram). La forma més senzilla al teu Huawei és <b>HTTP Shortcuts</b>:
                    </div>
                    <ol style={{margin:"0 0 12px 18px",padding:0,fontSize:12,color:C.text,lineHeight:1.7}}>
                      <li>Instal·la <b>HTTP Shortcuts</b> des de F-Droid (és gratis i sense Google).</li>
                      <li>Crea un Shortcut nou amb la configuració d'aquí sota.</li>
                      <li>Quan vegis un missatge de patrulla a WhatsApp, copia'l (mantenir premut → Copiar) i toca el Shortcut.</li>
                      <li>El Shortcut t'obrirà un quadre per enganxar el text i enviar-lo a l'app.</li>
                    </ol>

                    <div style={{fontSize:11,color:C.textDim,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Configuració del Shortcut</div>
                    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:10,fontSize:11,fontFamily:"monospace",color:C.text,lineHeight:1.6,marginBottom:8}}>
                      <div><span style={{color:C.textMuted}}>Mètode:</span> POST</div>
                      <div style={{wordBreak:"break-all"}}><span style={{color:C.textMuted}}>URL:</span> {httpShortcutsConfig}</div>
                      <div><span style={{color:C.textMuted}}>Header 1:</span> content-type · application/json</div>
                      <div style={{wordBreak:"break-all"}}><span style={{color:C.textMuted}}>Header 2:</span> x-ingest-token · {showToken?apiToken:(apiToken?apiToken.substring(0,8)+"…"+apiToken.substring(apiToken.length-4):"<token>")}</div>
                      <div><span style={{color:C.textMuted}}>Body type:</span> Custom text (JSON)</div>
                      <div style={{wordBreak:"break-all"}}><span style={{color:C.textMuted}}>Body:</span> {httpBody}</div>
                      <div style={{fontSize:10,color:C.textMuted,marginTop:6}}>↳ HTTP Shortcuts substitueix <b>%s</b> pel text que enganxis al moment.</div>
                    </div>

                    <button onClick={()=>copyToClipboard(JSON.stringify({
                      method:"POST",url:httpShortcutsConfig,
                      headers:{"content-type":"application/json","x-ingest-token":apiToken},
                      body:httpBody,
                    },null,2),setConfigCopied)} style={{width:"100%",padding:"10px",background:configCopied?C.success:"transparent",color:configCopied?"#fff":C.accent,border:`1px solid ${configCopied?C.success:C.accent}`,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                      {configCopied?"✓ Configuració copiada":"📋 Copiar configuració JSON"}
                    </button>

                    <div style={{fontSize:11,color:C.warning,marginTop:8,padding:"8px 10px",background:`${C.warning}11`,border:`1px solid ${C.warning}44`,borderRadius:6,lineHeight:1.5}}>
                      ⚠ El botó copia <b>sempre el token actual</b>. Si fas servir "Generar nou" al pas 1, has de tornar a copiar aquesta configuració i enganxar-la al HTTP Shortcuts per substituir el header `x-ingest-token`.
                    </div>

                    <div style={{fontSize:11,color:C.textMuted,marginTop:10,lineHeight:1.5,fontStyle:"italic"}}>
                      Alternativa: <b>Tasker</b> (APK del web oficial) pot detectar automàticament cada notificació de WhatsApp i fer la crida sense que premis res — més potent però més complicat de configurar.
                    </div>
                  </>))}
                </div>
              );
            })()}

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

            {/* 🔍 Estat Telegram — diagnòstic */}
            <div style={{background:C.surface,borderRadius:12,padding:16,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
                <div style={{fontSize:17,fontWeight:700,color:C.accent}}>🔍 Estat Telegram</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={repairTelegramWebhook} disabled={tgRepairing} style={{background:tgRepairing?C.border:"transparent",color:tgRepairing?C.textDim:C.warning,border:`1px solid ${C.warning}`,borderRadius:6,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:tgRepairing?"wait":"pointer",fontFamily:"inherit"}}>
                    {tgRepairing?"Reparant…":"🔧 Reparar webhook"}
                  </button>
                  <button onClick={checkTelegramStatus} disabled={tgLoading} style={{background:tgLoading?C.border:C.accent,color:tgLoading?C.textDim:C.bg,border:"none",borderRadius:6,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:tgLoading?"wait":"pointer",fontFamily:"inherit"}}>
                    {tgLoading?"Comprovant…":"Comprovar"}
                  </button>
                </div>
              </div>
              <div style={{fontSize:12,color:C.textDim,marginBottom:tgStatus?12:0,lineHeight:1.5}}>
                Diagnostica per què el bot @{botUsername} pot no estar enviant deteccions. Si <b>"URL del webhook"</b> surt buida, prem <b>🔧 Reparar webhook</b>: el servidor el tornarà a registrar tot sol.
              </div>
              {tgRepairMsg&&(
                <div style={{marginBottom:12,padding:"10px 12px",borderRadius:8,fontSize:12,lineHeight:1.5,background:tgRepairMsg.ok?`${C.success}22`:`${C.danger}22`,border:`1px solid ${tgRepairMsg.ok?C.success:C.danger}55`,color:tgRepairMsg.ok?C.success:C.danger}}>
                  {tgRepairMsg.text}
                </div>
              )}
              {tgStatus&&(
                tgStatus.ok===false?(
                  <div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}`,borderRadius:8,padding:10,fontSize:13,color:C.danger}}>
                    ✗ Error: {tgStatus.reason||"desconegut"}
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {/* Configuració */}
                    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
                      <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Configuració del worker</div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}>
                        <span style={{color:C.textDim}}>Webhook secret</span>
                        <span style={{color:tgStatus.secret_configured?C.success:C.danger,fontWeight:700}}>{tgStatus.secret_configured?"✓ configurat":"✗ falta"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                        <span style={{color:C.textDim}}>Bot token</span>
                        <span style={{color:tgStatus.bot_token_configured?C.success:C.warning,fontWeight:700}}>{tgStatus.bot_token_configured?"✓ configurat":"⚠ falta"}</span>
                      </div>
                      {!tgStatus.bot_token_configured&&(
                        <div style={{fontSize:11,color:C.warning,marginTop:8,lineHeight:1.5}}>
                          Per veure l'estat del webhook a Telegram, afegeix el token del bot com a secret:<br/>
                          <code style={{background:C.surface,padding:"2px 5px",borderRadius:3,fontSize:11,color:C.text}}>wrangler secret put TELEGRAM_BOT_TOKEN</code>
                        </div>
                      )}
                    </div>

                    {/* Hits 24h */}
                    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
                      <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Hits al webhook (últimes 24h)</div>
                      {Object.keys(tgStatus.hits_24h||{}).length===0?(
                        <div style={{fontSize:13,color:C.danger}}>⚠ Cap hit en 24h — Telegram no està arribant al worker</div>
                      ):(
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {Object.entries(tgStatus.hits_24h).map(([outcome,n])=>{
                            const labels={stored:["✓ Guardats",C.success],rejected_no_patrol:["⊘ Rebutjats (no parlen de patrulles)",C.warning],ignored_short:["… Missatges molt curts",C.textDim],ignored_no_msg:["… Updates sense text",C.textDim],auth_fail:["✗ Secret invàlid",C.danger],auth_missing:["✗ Secret no configurat",C.danger],json_error:["✗ JSON invàlid",C.danger]};
                            const[lbl,col]=labels[outcome]||[outcome,C.textDim];
                            return(
                              <div key={outcome} style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                                <span style={{color:col}}>{lbl}</span>
                                <span style={{color:col,fontWeight:700}}>{n}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {tgStatus.last_hit&&(
                        <div style={{fontSize:11,color:C.textMuted,marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                          Últim hit: {new Date(tgStatus.last_hit.received_at).toLocaleString("ca-ES")} · <b style={{color:C.textDim}}>{tgStatus.last_hit.outcome}</b>
                          {tgStatus.last_hit.chat_title&&<><br/>Grup: {tgStatus.last_hit.chat_title}</>}
                          {tgStatus.last_hit.text_preview&&<><br/><i>"{tgStatus.last_hit.text_preview}"</i></>}
                        </div>
                      )}
                    </div>

                    {/* Webhook info */}
                    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
                      <div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Webhook registrat a Telegram</div>
                      {tgStatus.webhook_info?(
                        <div style={{fontSize:13,display:"flex",flexDirection:"column",gap:3}}>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{color:C.textDim}}>URL</span>
                            <span style={{color:tgStatus.webhook_info.url?C.success:C.danger,fontWeight:700,fontSize:11,wordBreak:"break-all",textAlign:"right",maxWidth:"60%"}}>{tgStatus.webhook_info.url||"(cap)"}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{color:C.textDim}}>Pending updates</span>
                            <span style={{color:tgStatus.webhook_info.pending_update_count>0?C.warning:C.text,fontWeight:700}}>{tgStatus.webhook_info.pending_update_count||0}</span>
                          </div>
                          {tgStatus.webhook_info.last_error_date&&(
                            <div style={{display:"flex",justifyContent:"space-between"}}>
                              <span style={{color:C.danger}}>Últim error</span>
                              <span style={{color:C.danger,fontWeight:700,fontSize:11,textAlign:"right",maxWidth:"60%"}}>{tgStatus.webhook_info.last_error_message||"?"}</span>
                            </div>
                          )}
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{color:C.textDim}}>Allowed updates</span>
                            <span style={{color:C.text,fontSize:11,textAlign:"right"}}>{(tgStatus.webhook_info.allowed_updates||[]).join(", ")||"(tots)"}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{color:C.textDim}}>Té secret</span>
                            <span style={{color:tgStatus.webhook_info.has_custom_certificate||tgStatus.secret_configured?C.success:C.warning,fontWeight:700}}>{tgStatus.secret_configured?"✓":"⚠ comprova"}</span>
                          </div>
                        </div>
                      ):(
                        <div style={{fontSize:12,color:C.warning,lineHeight:1.5}}>{tgStatus.webhook_error||"no disponible"}</div>
                      )}
                    </div>

                    {/* Pista útil */}
                    {tgStatus.hits_24h&&!tgStatus.hits_24h.stored&&!tgStatus.hits_24h.rejected_no_patrol&&!tgStatus.hits_24h.ignored_short&&(
                      <div style={{background:`${C.warning}22`,border:`1px solid ${C.warning}`,borderRadius:8,padding:10,fontSize:12,color:C.warning,lineHeight:1.5}}>
                        💡 <b>El webhook no està rebent missatges normals.</b> Causa més probable: <b>privacy mode</b> del bot. Ves a <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{color:C.warning,textDecoration:"underline"}}>@BotFather</a> → /mybots → @{botUsername} → Bot Settings → Group Privacy → <b>Disable</b>. Després envia /promote o treu i torna a afegir el bot al grup perquè es refresqui.
                      </div>
                    )}
                  </div>
                )
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
          <div onClick={()=>setSelectedGroup(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9900,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
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
          <div onClick={()=>setZoneDetail(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9900,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
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
          <div onClick={()=>setSelectedDet(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9900,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
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
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9900,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
        >
          <div
            onClick={e=>e.stopPropagation()}
            style={{width:"100%",maxWidth:520,maxHeight:"calc(100dvh - 24px)",overflowY:"auto",background:C.surface,borderTop:`2px solid ${C.accent}`,borderRadius:"16px 16px 0 0",padding:18,boxShadow:`0 -10px 40px rgba(0,0,0,0.6)`}}
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

      {/* Bottom nav — 7 pestanyes que comparteixen ample equitatiu, icones SVG.
          Alçada FIXA per evitar que els botons es moguin: icona sempre size 22,
          només color i pes del text canvien per l'estat actiu. */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9800,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",padding:"8px 0 max(10px, env(safe-area-inset-bottom))",boxShadow:"0 -2px 12px rgba(0,0,0,0.35)"}}>
        {tabs.map(t=>{
          const active=tab===t.id;
          const col=active?C.accent:C.textMuted;
          return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"1 1 0",minWidth:0,height:48,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"2px 2px",position:"relative"}}>
              {active&&<span style={{position:"absolute",top:0,left:"30%",right:"30%",height:2,background:C.accent,borderRadius:"0 0 2px 2px"}}/>}
              <TabIcon id={t.id} color={col} size={22}/>
              <span style={{fontSize:10,color:col,letterSpacing:"0.02em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",fontWeight:active?700:500}}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
    </ThemeContext.Provider>
  );
}
