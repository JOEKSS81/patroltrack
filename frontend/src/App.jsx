import { useState, useEffect, useRef, useMemo } from "react";
import dogComic from "./assets/dog-comic.webp";
import MapTab from "./MapTab";
import ZoneMap from "./ZoneMap";
import { THEMES, ThemeContext, useC } from "./lib/themes";
import { API, ZONES, MAP_ZONES, ptWith, DAYS_FULL, MONTHS, DAYS_ORDER_MON } from "./lib/constants";
import { computeHourly, distKm } from "./lib/utils";
import { zoneStatus, durText, pct } from "./lib/risk";
import { useRadar } from "./lib/useRadar";
import Splash from "./components/Splash";
import Collapsible from "./components/Collapsible";
import GroupManager from "./components/GroupManager";
import FriendsManager from "./components/FriendsManager";
import ConnectGroups from "./components/ConnectGroups";
import MyKey from "./components/MyKey";
import PkPicker from "./components/PkPicker";
import RadarTab from "./tabs/RadarTab";
import StatsTab from "./tabs/StatsTab";
import FuelTab from "./tabs/FuelTab";
import AlcoholTab from "./tabs/AlcoholTab";

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
// Zona del mapa més propera a una posició (null si estàs a més de 40 km de totes).
function nearestMapZone(lat, lng) {
  let best = null, bestD = Infinity;
  for (const z of MAP_ZONES) {
    const d = distKm(lat, lng, z.lat, z.lng);
    if (d < bestD) { bestD = d; best = z; }
  }
  return best && bestD <= 40 ? best.id : null;
}
// Darrera posició GPS bona desada pels mapes o el radar.
function lastKnownPos() {
  try { const p = JSON.parse(localStorage.getItem("pt_last_pos") || "null"); return p && typeof p.lat === "number" ? p : null; } catch { return null; }
}

export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [detections,setDetections]=useState([]);
  const [health,setHealth]=useState(null);
  // Zona seleccionada: per defecte la MÉS PROPERA a on ets (abans sempre "N-II").
  // Si en toques una al mapa o a la llista, es respecta durant aquesta sessió.
  const zoneManualRef=useRef((()=>{try{return !!sessionStorage.getItem("pt_sel_zone");}catch{return false;}})());
  const [selectedZone,setSelectedZoneRaw]=useState(()=>{
    try{const m=sessionStorage.getItem("pt_sel_zone");if(m)return m;}catch{}
    const p=lastKnownPos();
    return (p&&nearestMapZone(p.lat,p.lng))||"N-II";
  });
  const setSelectedZone=(z)=>{
    zoneManualRef.current=true;
    try{sessionStorage.setItem("pt_sel_zone",z);}catch{}
    setSelectedZoneRaw(z);
  };
  const followMyZone=(lat,lng)=>{
    if(zoneManualRef.current)return;
    const z=nearestMapZone(lat,lng);
    if(z)setSelectedZoneRaw(prev=>prev===z?prev:z);
  };
  const [queryZone,setQueryZone]=useState("N-II");
  const [queryHour,setQueryHour]=useState(new Date().getHours());
  const [queryDay,setQueryDay]=useState(new Date().getDay());
  const [queryPK,setQueryPK]=useState("");
  const [showPkPicker,setShowPkPicker]=useState(false);
  const [queryResult,setQueryResult]=useState(null);
  // Model de possibilitat del servidor (/api/zone-probs): per zona, ara mateix.
  // Té en compte els avisos en viu, quanta estona sol durar un control i l'històric.
  const [risk,setRisk]=useState(()=>{try{const r=JSON.parse(localStorage.getItem("pt_risk")||"null");return r&&r.zones?r:null;}catch{return null;}});
  const zoneProbs=useMemo(()=>{const p={};if(risk&&risk.zones)for(const[z,v]of Object.entries(risk.zones))p[z]=v.p||0;return p;},[risk]);
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

  const radar=useRadar(detections,risk&&risk.detections);
  // Segueix la teva zona: amb el radar actiu, a cada posició nova…
  useEffect(()=>{ if(radar.pos) followMyZone(radar.pos.lat,radar.pos.lng); },[radar.pos]); // eslint-disable-line react-hooks/exhaustive-deps
  // …i, en obrir l'app, si el permís d'ubicació ja està donat (sense tornar a preguntar).
  useEffect(()=>{
    let alive=true;
    navigator.permissions?.query({name:"geolocation"}).then(st=>{
      if(!alive||st.state!=="granted")return;
      navigator.geolocation.getCurrentPosition(p=>{ if(alive) followMyZone(p.coords.latitude,p.coords.longitude); },()=>{},{enableHighAccuracy:false,maximumAge:600000,timeout:15000});
    }).catch(()=>{});
    return()=>{alive=false;};
  },[]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasActive=typeof window!=="undefined"&&(()=>{try{return localStorage.getItem("pt_auto")==="1";}catch{return false;}})();
  // Si l'app s'obre des de «Compartir», es va directe al formulari (sense pantalla d'inici).
  const [showSplash,setShowSplash]=useState(()=>{
    if(typeof window==="undefined") return true;
    const q=new URLSearchParams(window.location.search);
    return !(q.get("share_text")||q.get("share_title")||q.get("share_url"));
  });

  // Llindar de risc per al mapa (% probabilitat per marcar zona com a risc)
  const [riskThreshold,setRiskThresholdRaw]=useState(()=>{
    try{const v=Number(localStorage.getItem("pt_risk_thresh"));return v>=0.1&&v<=0.9?v:0.4;}catch{return 0.4;}
  });
  const setRiskThreshold=(v)=>{setRiskThresholdRaw(v);try{localStorage.setItem("pt_risk_thresh",String(v));}catch{}};

  // Alçada del mapa: que càpiga just entre la seva part de dalt i la barra de navegació
  // (abans era fixa i, amb capçaleres altes, la part de baix quedava amagada).
  const mapBoxRef=useRef(null);
  const navRef=useRef(null);
  // Pestanya Alcohol: visible per a tothom (?alcohol=0 l'amaga en aquest mòbil).
  const [showAlcohol]=useState(()=>{
    try{
      const q=new URLSearchParams(window.location.search).get("alcohol");
      if(q==="0") localStorage.setItem("pt_alcohol_tab","0");
      if(q==="1") localStorage.removeItem("pt_alcohol_tab");
      return localStorage.getItem("pt_alcohol_tab")!=="0";
    }catch{return true;}
  });
  // Alçada real de la barra de pestanyes (depèn de la barra de gestos del mòbil): el botó
  // + i el marge inferior del contingut s'hi col·loquen a sobre, mai a sota.
  const [navH,setNavH]=useState(62);
  useEffect(()=>{
    const el=navRef.current; if(!el) return;
    const upd=()=>setNavH(el.offsetHeight||62);
    upd();
    if(typeof ResizeObserver==="undefined"){window.addEventListener("resize",upd);return()=>window.removeEventListener("resize",upd);}
    const ro=new ResizeObserver(upd); ro.observe(el,{box:"border-box"});
    return()=>ro.disconnect();
  },[]);
  const [mapH,setMapH]=useState(null);

  // Token API + report manual ----------------------------------------------
  // Enllaç d'invitació (#invite=pt_…): el token personal de l'amic té prioritat i es desa.
  const [inviteToken]=useState(()=>{
    const m=/[#&]invite=(pt_[A-Za-z0-9_-]+)/.exec(typeof window!=="undefined"?window.location.hash||"":"");
    return m?m[1]:null;
  });
  const [apiToken,setApiTokenRaw]=useState(()=>{
    if(inviteToken){ try{localStorage.setItem("pt_token",inviteToken);}catch{ /* sense emmagatzematge */ } return inviteToken; }
    try{return localStorage.getItem("pt_token")||"";}catch{return "";}
  });
  const setApiToken=(t)=>{
    setApiTokenRaw(t);
    try{ if(t) localStorage.setItem("pt_token",t); else localStorage.removeItem("pt_token"); }catch{}
  };
  const [inviteWelcome,setInviteWelcome]=useState(()=>Boolean(inviteToken));
  // Treu el token de l'adreça perquè no quedi a l'historial ni es comparteixi per error.
  useEffect(()=>{
    if(inviteToken) history.replaceState(null,"",window.location.pathname+window.location.search);
  },[inviteToken]);
  // Qui sóc (admin o amic) i el meu codi per vincular grups de Telegram.
  const [me,setMe]=useState(null);
  useEffect(()=>{
    if(!apiToken) return;
    let alive=true;
    fetch(`${API}/api/me`,{headers:{"x-ingest-token":apiToken}})
      .then(r=>r.ok?r.json():null).then(d=>{ if(alive) setMe(d&&d.ok?d:null); }).catch(()=>{});
    return ()=>{alive=false;};
  },[apiToken]);
  const shareAppUrl = typeof window!=="undefined" ? window.location.origin : "https://patroltrack.pages.dev";

  // Foto del gos cyborg (empaquetada per Vite; /dog.png ja no existeix)
  const dogPhoto = dogComic;

  // Estat per al modal de detall del historial -------------------------------
  const [selectedDet,setSelectedDet]=useState(null);

  // «Compartir → PatrolTrack» des de WhatsApp (Web Share Target del manifest):
  // l'app s'obre amb ?share_text=… i el formulari de report ja ple.
  const [sharedText]=useState(()=>{
    if(typeof window==="undefined") return "";
    const q=new URLSearchParams(window.location.search);
    const parts=[q.get("share_title"),q.get("share_text"),q.get("share_url")].map(v=>(v||"").trim()).filter(Boolean);
    // Quan es comparteixen missatges, WhatsApp hi pot afegir "[20/11 12:00] Nom: ": es treu.
    return [...new Set(parts)].join("\n").replace(/^\[[^\]]{4,30}\]\s*[^:\n]{1,40}:\s*/gm,"").trim();
  });
  useEffect(()=>{
    if(!sharedText) return;
    const q=new URLSearchParams(window.location.search);
    ["share_title","share_text","share_url"].forEach(k=>q.delete(k));
    const rest=q.toString();
    history.replaceState(null,"",window.location.pathname+(rest?`?${rest}`:"")+window.location.hash);
  },[sharedText]);
  const [showReport,setShowReport]=useState(()=>Boolean(sharedText));
  const [reportMsg,setReportMsg]=useState(sharedText);
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
        const[hr,dr,rr]=await Promise.all([
          fetch(`${API}/api/health`,{cache:"no-store"}).catch(()=>null),
          fetch(`${API}/api/detections?limit=500`,{cache:"no-store"}).catch(()=>null),
          fetch(`${API}/api/zone-probs`,{cache:"no-store"}).catch(()=>null),
        ]);
        const rk=rr&&rr.ok?await rr.json().catch(()=>null):null;
        if(rk&&rk.zones&&aliveRef.current){setRisk(rk);try{localStorage.setItem("pt_risk",JSON.stringify(rk));}catch{}}
        const h=hr&&hr.ok?await hr.json().catch(()=>null):null;
        const d=dr&&dr.ok?await dr.json().catch(()=>null):null;
        if(!aliveRef.current)return;
        if(h){setHealth(h);try{localStorage.setItem("pt_health",JSON.stringify(h));}catch{}; ok=true;}
        if(Array.isArray(d)){
          if(d.length>prevCount.current&&prevCount.current>0){setNewAlert(d[0]);setTimeout(()=>{if(aliveRef.current)setNewAlert(null);},4000);}
          prevCount.current=d.length;
          setDetections(d);
          try{localStorage.setItem("pt_detections",JSON.stringify(d));}catch{}
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
  useEffect(()=>{
    if(tab!=="osm") return;
    const calc=()=>{
      const el=mapBoxRef.current; if(!el) return;
      const top=el.getBoundingClientRect().top+window.scrollY;      // posició al document
      const navH=navRef.current?navRef.current.offsetHeight:70;
      setMapH(Math.max(300,Math.round(window.innerHeight-top-navH-12)));
    };
    calc();
    const t1=setTimeout(calc,300), t2=setTimeout(calc,1200);        // la capçalera (foto del gos) pot créixer en carregar
    window.addEventListener("resize",calc);
    window.addEventListener("orientationchange",calc);
    return()=>{clearTimeout(t1);clearTimeout(t2);window.removeEventListener("resize",calc);window.removeEventListener("orientationchange",calc);};
  },[tab,mapMode]);

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
      const r=await fetch(`${API}/api/probability?zone=${encodeURIComponent(queryZone)}&hour=${queryHour}&dow=${queryDay}`);
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
    {id:"fuel",     label:"Benzina"},
    ...(showAlcohol?[{id:"alcohol",label:"Alcohol"}]:[]),
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
      case "alcohol":   return(<svg {...props}><path d="M8 2h8l-.6 6.5a3.4 3.4 0 0 1-6.8 0z"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="22" x2="16" y2="22"/></svg>);
      case "fuel":      return(<svg {...props}><path d="M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><line x1="2" y1="22" x2="16" y2="22"/><rect x="6" y="6" width="6" height="5"/><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/></svg>);
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
      {inviteWelcome&&(
        <div style={{position:"fixed",top:12,left:12,right:12,zIndex:9900,background:C.surface,border:`1px solid ${C.success}`,borderRadius:12,padding:"12px 14px",boxShadow:"0 6px 24px rgba(0,0,0,0.5)",fontSize:13,color:C.text,lineHeight:1.5}}>
          <b style={{color:C.success}}>✓ Benvingut{me&&!me.admin?`, ${me.name}`:""}!</b> L'app ja té el teu accés.
          Ves a <b>Config → 👥 Els meus grups</b> per connectar els teus grups de WhatsApp o Telegram.
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>{setInviteWelcome(false);setTab("config");}} style={{background:C.accent,color:C.bg,border:"none",borderRadius:7,padding:"7px 12px",fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>Anar-hi</button>
            <button onClick={()=>setInviteWelcome(false)} style={{background:"none",color:C.textDim,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 12px",fontFamily:"inherit",cursor:"pointer"}}>Després</button>
          </div>
        </div>
      )}

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

      <div style={{flex:1,padding:`12px 12px ${navH+90}px`,overflowY:"auto",position:"relative"}}>

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
                    <div style={{fontSize:10,color:C.textMuted}}>possibilitat ara</div>
                  </div>
                </div>

                {/* Estat ara: control actiu / ja han marxat / històric */}
                {(()=>{
                  const st=zoneStatus(risk&&risk.zones&&risk.zones[selectedZone],risk&&risk.model);
                  const col=st.tone==="danger"?C.danger:st.tone==="success"?C.success:C.textDim;
                  return(
                    <div style={{background:st.tone==="neutral"?C.bg:`${col}14`,border:`1px solid ${st.tone==="neutral"?C.border:col+"66"}`,borderRadius:8,padding:"8px 10px",marginBottom:10}}>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.4}}><b style={{color:st.tone==="neutral"?C.text:col}}>{st.title}</b>{st.line?<span style={{color:C.textDim}}> · {st.line}</span>:null}</div>
                      {st.hint&&<div style={{fontSize:12,color:C.textMuted,marginTop:3}}>⏱ {st.hint}</div>}
                    </div>
                  );
                })()}

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
                  <div style={{fontSize:12,color:C.textMuted,marginTop:6,lineHeight:1.5}}>Arribaran sols dels grups connectats amb MacroDroid (Config) o avisa a mà amb el botó <b style={{color:C.accent}}>+</b></div>
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
            <div ref={mapBoxRef} style={mapMode==="schema"?undefined:{height:mapH?`${mapH}px`:"calc(100dvh - 320px)",minHeight:300}}>
              {mapMode==="schema"?(
                <ZoneMap
                  mapHeight={mapH?`${Math.max(300,mapH-56)}px`:"calc(100dvh - 376px)"}
                  zones={MAP_ZONES}
                  probs={zoneProbs}
                  selected={selectedZone}
                  onSelect={setSelectedZone}
                  onPosition={followMyZone}
                  detections={detections}
                  theme={currentTheme}
                  radarPos={radar.active?radar.pos:null}
                  riskThreshold={riskThreshold}
                />
              ):(
                <MapTab
                  zones={MAP_ZONES}
                  probs={zoneProbs}
                  selected={selectedZone}
                  onSelect={setSelectedZone}
                  onPosition={followMyZone}
                  theme={currentTheme}
                  themeName={themeName}
                  detections={detections}
                  radarPos={radar.active?radar.pos:null}
                  riskThreshold={riskThreshold}
                />
              )}
            </div>
          </div>
        )}

        {tab==="radar"&&<RadarTab radar={radar} dogPhoto={dogPhoto} onDetTap={(d)=>setSelectedDet(d)} zone={selectedZone} zoneInfo={risk&&risk.zones&&risk.zones[selectedZone]} riskModel={risk&&risk.model}/>}
        {tab==="fuel"&&<FuelTab apiToken={apiToken}/>}
        {tab==="alcohol"&&showAlcohol&&<AlcoholTab/>}
        {tab==="stats"&&<StatsTab detections={detections} risk={risk} onZoneTap={(z)=>setZoneDetail(z)} onDetTap={(d)=>setSelectedDet(d)}/>}

        {/* QUERY */}
        {tab==="query"&&(
          <div>
            {showPkPicker&&(
              <PkPicker zone={queryZone} pkText={queryPK} onClose={()=>setShowPkPicker(false)}
                onUse={({zone,pk})=>{setQueryZone(zone);setQueryPK(pk);setShowPkPicker(false);}}/>
            )}
            <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:14,color:C.accent}}>Consulta de probabilitat</div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:13,color:C.textDim,display:"block",marginBottom:5}}>Zona / Municipi</label>
                <select value={queryZone} onChange={e=>setQueryZone(e.target.value)} style={ss}>{(ZONES.includes(queryZone)?ZONES:[queryZone,...ZONES]).map(z=><option key={z} value={z}>{z}</option>)}</select>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:13,color:C.textDim,display:"block",marginBottom:5}}>Punt Quilomètric (opcional)</label>
                <div style={{display:"flex",gap:6}}>
                  <input type="text" value={queryPK} onChange={e=>setQueryPK(e.target.value)} placeholder="ex: km 45" style={{...ss,boxSizing:"border-box",flex:1,minWidth:0}}/>
                  <button onClick={()=>setShowPkPicker(true)} style={{flexShrink:0,padding:"0 12px",background:C.accentDim,color:C.accent,border:`1px solid ${C.accent}`,borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🗺 Al mapa</button>
                </div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:4}}>No el saps? Toca <b>🗺 Al mapa</b> i marca el punt de la carretera.</div>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:13,color:C.textDim,display:"block",marginBottom:5}}>Dia de la setmana</label>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {DAYS_ORDER_MON.map((i)=>(
                    <button key={i} onClick={()=>setQueryDay(i)} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${queryDay===i?C.accent:C.border}`,background:queryDay===i?C.accentDim:"transparent",color:queryDay===i?C.accent:C.textDim,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      {DAYS_FULL[i].substring(0,3)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                  <label style={{fontSize:13,color:C.textDim}}>Hora del dia</label>
                  <div style={{textAlign:"right"}}>
                    <span style={{fontSize:20,fontWeight:800,color:C.accent}}>{String(queryHour).padStart(2,"0")}:00 h</span>
                    <span style={{fontSize:11,color:C.textMuted,marginLeft:6}}>
                      {queryHour<6?"matinada":queryHour<12?"matí":queryHour<14?"migdia":queryHour<20?"tarda":"nit"}
                    </span>
                  </div>
                </div>
                <input type="range" min={0} max={23} value={queryHour} onChange={e=>setQueryHour(Number(e.target.value))} style={{width:"100%",accentColor:C.accent}}/>
                {/* Regla amb marca a cada hora i número cada 3h */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:2,height:18}}>
                  {Array.from({length:24},(_,h)=>(
                    <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div style={{width:1,height:h%3===0?7:3,background:h===queryHour?C.accent:C.textMuted,opacity:h===queryHour?1:0.6}}/>
                      {h%3===0&&<span style={{fontSize:9,color:h===queryHour?C.accent:C.textMuted,fontWeight:h===queryHour?700:400}}>{h}</span>}
                    </div>
                  ))}
                </div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:4}}>
                  Es mira la franja <b style={{color:C.textDim}}>{String(queryHour).padStart(2,"0")}:30 ± 45 min</b> i els dies {[0,6].includes(queryDay)?"de cap de setmana":"feiners"} (els recents pesen més).
                </div>
              </div>
              <button onClick={handleQuery} disabled={querying} style={{width:"100%",padding:12,background:querying?C.border:C.accent,color:querying?C.textDim:"#000",border:"none",borderRadius:8,fontSize:16,fontWeight:800,cursor:querying?"wait":"pointer",fontFamily:"inherit",opacity:querying?0.7:1}}>{querying?"CONSULTANT…":"CONSULTAR"}</button>
            </div>
            {queryResult&&(
              <div style={{background:C.surface,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
                {queryResult.error&&(
                  <div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}`,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.danger}}>⚠ {queryResult.error}</div>
                )}
                {!queryResult.error&&queryResult.sample_size===0&&(
                  <div style={{background:`${C.warning}22`,border:`1px solid ${C.warning}`,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.warning}}>📭 Encara no s'ha avisat de cap control en aquesta zona. Com més avisos arribin, més precís serà.</div>
                )}
                <div style={{textAlign:"center",marginBottom:14}}>
                  <div style={{fontSize:13,color:C.textDim,marginBottom:4}}>{queryZone}{queryResult.pk?` · ${queryResult.pk}`:""} · {DAYS_FULL[queryResult.day]} · {queryHour}:00h</div>
                  <div style={{fontSize:64,fontWeight:900,lineHeight:1,color:(queryResult.overall||0)>0.6?C.danger:(queryResult.overall||0)>0.35?C.warning:C.success,textShadow:"0 0 30px currentColor"}}>{Math.round((queryResult.overall||0)*100)}%</div>
                  <div style={{fontSize:14,color:C.textDim,marginTop:4}}>possibilitat de trobar un control</div>
                  {queryResult.now&&(queryResult.live>0||queryResult.hist>0)&&(
                    <div style={{fontSize:12,color:C.textMuted,marginTop:6}}>
                      {queryResult.active?<><b style={{color:C.danger}}>🔴 Ara hi ha un control avisat</b> · </>:null}
                      en viu {pct(queryResult.live)}% · històric {pct(queryResult.hist)}%
                    </div>
                  )}
                </div>
                <div style={{background:C.bg,borderRadius:8,padding:12}}>
                  <ProbBar value={queryResult.mossos} type="mossos"/>
                  <ProbBar value={queryResult.guardia} type="guardia"/>
                  <ProbBar value={queryResult.local} type="local"/>
                </div>
                <div style={{marginTop:10,padding:10,background:C.accentDim,borderRadius:8,border:`1px solid ${C.accentGlow}`}}>
                  <div style={{fontSize:13,color:C.accent,fontWeight:700}}>{(queryResult.overall||0)>0.6?"⚠ Alta probabilitat":(queryResult.overall||0)>0.35?"◎ Probabilitat moderada":"✓ Baixa probabilitat"}</div>
                  <div style={{fontSize:13,color:C.textDim,marginTop:4}}>Basat en {queryResult.sample_size||0} controls en {queryResult.observed_days||0} dies · Fiabilitat: {queryResult.reliability||"baixa"}</div>
                  {queryResult.duration_min>0&&<div style={{fontSize:12,color:C.textMuted,marginTop:3}}>⏱ Aquí un control sol durar ~{durText(queryResult.duration_min)}</div>}
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
            {/* 📲 Connectar els teus grups (MacroDroid) — el primer i el més important */}
            <Collapsible title="📲 Connecta els teus grups" subtitle="Perquè els avisos dels teus grups entrin a l'app" defaultOpen={true}>
              <ConnectGroups apiToken={apiToken} onGoToGroups={()=>document.getElementById("cfg-groups")?.scrollIntoView({behavior:"smooth",block:"start"})}/>
            </Collapsible>

            {/* 👥 Gestió de grups (activar, desactivar, afegir) */}
            <div id="cfg-groups"/>
            <Collapsible
              title="👥 Els meus grups"
              subtitle={me?`Connectat com a ${me.admin?"administrador":me.name}`:"Apareixen sols: tria quins segueixes"}
              defaultOpen={true}
            >
              <GroupManager apiToken={apiToken}/>
            </Collapsible>

            {/* 🤝 Accessos per amic (només admin) */}
            {me?.admin&&(
              <Collapsible title="🤝 Amics" subtitle="Crea un accés personal per a cada amic" defaultOpen={false}>
                <FriendsManager apiToken={apiToken}/>
              </Collapsible>
            )}

            {/* 📤 Compartir l'app (el bot de Telegram s'ha tret: molts grups no el deixen entrar) */}
            {!me?.admin&&(
            <Collapsible title="📤 Compartir l'app" subtitle="Enllaç per instal·lar PatrolTrack" defaultOpen={false}>
              <div style={{padding:12,background:C.bg,borderRadius:8,border:`1px solid ${C.border}`}}>
                                <div style={{fontSize:13,color:C.textDim,marginBottom:10,lineHeight:1.5}}>
                  Comparteix aquest enllaç: el teu amic veurà tots els avisos. Perquè també entrin els dels <b>seus</b> grups, cal que configuri MacroDroid (guia a «Els meus grups») amb l'accés personal que li creïs a «🤝 Amics».
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
            </Collapsible>
            )}

            {/* 🎨 Skin / Tema */}
            <Collapsible title="🎨 Aspecte" subtitle="Colors de l'app" defaultOpen={false}>
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
            </Collapsible>


            {/* 🗺 Mapa: llindar de risc (abans era a la pestanya Radar) */}
            <Collapsible title="🗺 Mapa" subtitle={`Zones en vermell a partir del ${Math.round(riskThreshold*100)}%`} defaultOpen={false}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                <span style={{fontSize:14,color:C.textDim}}>Llindar de risc al mapa</span>
                <span style={{fontSize:18,fontWeight:900,color:riskThreshold>0.6?C.danger:riskThreshold>0.35?C.warning:C.success}}>{Math.round(riskThreshold*100)}%</span>
              </div>
              <input type="range" min={10} max={80} step={5} value={Math.round(riskThreshold*100)} onChange={e=>setRiskThreshold(Number(e.target.value)/100)} style={{width:"100%",accentColor:C.accent}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.textMuted,marginTop:2}}><span>Més sensible</span><span>Més estricte</span></div>
              <div style={{fontSize:12,color:C.textDim,marginTop:8,lineHeight:1.5}}>Les zones dels mapes es pinten en <b style={{color:C.danger}}>vermell</b> quan la probabilitat de control supera aquest percentatge.</div>
            </Collapsible>


            {/* ⚙ Avançat: només per a qui administra l'app */}
            <div style={{fontSize:12,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",margin:"22px 4px 8px"}}>Avançat</div>

            <MyKey apiToken={apiToken} setApiToken={setApiToken}/>

            {/* 📡 Grups connectats */}
            <Collapsible
              title="🗂 Avisos desats per grup"
              subtitle={`${groupsAggregate.length} grup${groupsAggregate.length===1?"":"s"} amb deteccions`}
              defaultOpen={false}
              right={<span style={{fontSize:12,color:C.textDim,fontWeight:700}}>{groupsAggregate.length}</span>}
            >
              <div style={{fontSize:13,color:C.textDim,marginBottom:12,lineHeight:1.5}}>
                Cada grup de Telegram o WhatsApp que hagi enviat com a mínim una detecció. Toca un grup per veure'n els missatges i tenir l'opció d'esborrar-los.
              </div>
              {groupsAggregate.length===0?(
                <div style={{padding:14,background:C.bg,borderRadius:8,border:`1px dashed ${C.border}`,textAlign:"center",fontSize:13,color:C.textDim}}>
                  Encara no hi ha cap avís desat amb grup.
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
            </Collapsible>


            <Collapsible title="📥 Fonts de dades" subtitle="Quins canals porten deteccions" defaultOpen={false}>
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
            </Collapsible>
            <Collapsible title="🩺 Estat del sistema" subtitle={health?`En línia · ${health.total} registres`:"Comprovant…"} defaultOpen={false}>
              {[{label:"Backend API",value:health?"En línia":"Fora de línia",ok:!!health},{label:"Base de dades",value:health?`${health.total} registres`:"—",ok:!!health},{label:"Última 24h",value:health?`${health.last_24h} deteccions`:"—",ok:true}].map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:15,color:C.textDim}}>{s.label}</span>
                  <span style={{fontSize:15,color:s.ok?C.success:C.danger,fontWeight:600}}>{s.value}</span>
                </div>
              ))}
              <a href="/arquitectura.html" target="_blank" rel="noopener" style={{display:"block",marginTop:12,textAlign:"center",fontSize:13,color:C.accent,textDecoration:"underline"}}>📐 Com funciona PatrolTrack (arquitectura)</a>
            </Collapsible>
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

              {me?.admin&&d.id&&(
                <button onClick={async()=>{
                  if(!confirm("Esborrar aquest avís? Desapareixerà del mapa i de les estadístiques."))return;
                  try{
                    const r=await fetch(`${API}/api/detections/delete`,{method:"POST",headers:{"content-type":"application/json","x-ingest-token":apiToken},body:JSON.stringify({id:d.id})});
                    const j=await r.json().catch(()=>({}));
                    if(!r.ok||!j.ok){alert(j.reason||`Error ${r.status}`);return;}
                    setSelectedDet(null); setRefreshTick(t=>t+1);
                  }catch(e){alert(e.message);}
                }} style={{width:"100%",marginTop:14,padding:10,background:"transparent",color:C.danger,border:`1px solid ${C.danger}`,borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  🗑 Esborrar aquest avís (no és real)
                </button>
              )}

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
          position:"fixed",bottom:navH+14,right:16,zIndex:9850,
          width:56,height:56,borderRadius:"50%",
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
              {sharedText&&reportMsg===sharedText
                ? <>Missatge rebut de <b>Compartir</b>. Revisa'l, posa-hi el grup si vols i toca Enviar.</>
                : "Enganxa o escriu el missatge. L'app extreu zona, tipus de patrulla i PK automàticament."}
            </div>
            {!sharedText&&(
              <div style={{fontSize:11,color:C.textMuted,marginBottom:8,lineHeight:1.4}}>
                💡 Més ràpid: a WhatsApp, mantén premut l'avís → <b>Compartir</b> → <b>PatrolTrack</b> (Android, amb l'app afegida a la pantalla d'inici).
              </div>
            )}

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
              placeholder={groupsAggregate.length?"Tria o escriu el grup (opcional)":"Nom del grup (opcional)"}
              list="pt-group-list"
              style={{...ss,boxSizing:"border-box",fontSize:13,marginTop:8}}
            />
            {/* Suggeriments: grups descoberts automàticament a partir de les deteccions */}
            <datalist id="pt-group-list">
              {groupsAggregate.filter(g=>g.name&&!["(sense grup)","Report manual","Telegram","WhatsApp"].includes(g.name)).map(g=><option key={g.name} value={g.name}/>)}
            </datalist>

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

      {/* Bottom nav — 8 pestanyes que comparteixen ample equitatiu, icones SVG.
          Alçada FIXA per evitar que els botons es moguin: icona sempre size 22,
          només color i pes del text canvien per l'estat actiu. */}
      <div ref={navRef} style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9800,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",padding:"4px 0 max(4px, min(env(safe-area-inset-bottom), 12px))",boxShadow:"0 -2px 12px rgba(0,0,0,0.35)"}}>
        {tabs.map(t=>{
          const active=tab===t.id;
          const col=active?C.accent:C.textMuted;
          return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"1 1 0",minWidth:0,height:46,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"2px 2px",position:"relative"}}>
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
