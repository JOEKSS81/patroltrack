// API URL — prioritats:
//   1) VITE_API_URL (env var de build)
//   2) Dev (Vite a :5173) → wrangler local (http://localhost:8787)
//   3) Mateix origin
export const API = (
  import.meta.env.VITE_API_URL
  || (typeof window !== "undefined" && window.location.port === "5173"
    ? "http://localhost:8787"
    : "")
);

// Llista completa de zones (carreteres + municipis de Lleida) — només per al desplegable de Consulta.
// El mapa OSM usa MAP_ZONES (subset amb coordenades).
export const ZONES = [
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
  // Valls del Pallars Sobirà i Alt Urgell
  "Vall Ferrera (Alins)","Àreu","Vall de Cardós","Tavascan","La Guingueta d'Àneu",
  "Espot","Escaló","Llessui","Senterada","Salàs de Pallars","Coll de Nargó",
  "Adrall","Castellciutat","Noves de Segre","Pont de Bar","Martinet",
];

// Zones del mapa OSM amb coordenades reals i radi d'influència (km)
export const MAP_ZONES = [
  { id: "N-II",            label: "N-II",     lat: 41.615, lng: 0.620, rKm: 15 },
  { id: "C-13",            label: "C-13",     lat: 41.850, lng: 0.950, rKm: 20 },
  { id: "C-14",            label: "C-14",     lat: 41.990, lng: 1.030, rKm: 18 },
  { id: "C-26",            label: "C-26",     lat: 41.790, lng: 0.810, rKm: 15 },
  { id: "A-2",             label: "A-2",      lat: 41.580, lng: 0.490, rKm: 20 },
  { id: "Lleida - Centre", label: "Lleida",   lat: 41.614, lng: 0.627, rKm: 8 },
  { id: "Mollerussa",      label: "Mollr.",   lat: 41.625, lng: 0.893, rKm: 5 },
  { id: "Tàrrega",         label: "Tàrrega",  lat: 41.645, lng: 1.139, rKm: 5 },
  { id: "Balaguer",        label: "Balaguer", lat: 41.791, lng: 0.811, rKm: 5 },
  { id: "La Seu d'Urgell", label: "Seu U.",   lat: 42.358, lng: 1.457, rKm: 5 },
  { id: "Tremp",           label: "Tremp",    lat: 42.167, lng: 0.900, rKm: 5 },
  { id: "Cervera",         label: "Cervera",  lat: 41.668, lng: 1.272, rKm: 5 },
  { id: "Sort",            label: "Sort",     lat: 42.412, lng: 1.128, rKm: 5 },
  { id: "Vielha",          label: "Vielha",   lat: 42.700, lng: 0.795, rKm: 5 },
  { id: "Artesa de Segre", label: "Artesa",   lat: 41.899, lng: 1.048, rKm: 5 },
  { id: "Ponts",           label: "Ponts",    lat: 41.920, lng: 1.195, rKm: 5 },
  // Pallars i Alt Urgell (coordenades de Mapbox)
  { id: "La Pobla de Segur",    label: "Pobla",    lat: 42.247,  lng: 0.972,  rKm: 5 },
  { id: "Gerri de la Sal",      label: "Gerri",    lat: 42.3235, lng: 1.0648, rKm: 4 },
  { id: "Rialp",                label: "Rialp",    lat: 42.357,  lng: 1.110,  rKm: 4 },
  { id: "Llavorsí",             label: "Llavorsí", lat: 42.490,  lng: 1.215,  rKm: 4 },
  { id: "Vall de Cardós",       label: "Cardós",   lat: 42.5634, lng: 1.2263, rKm: 5 },
  { id: "Vall Ferrera (Alins)", label: "V.Ferrera",lat: 42.5489, lng: 1.3174, rKm: 5 },
  { id: "Esterri d'Àneu",       label: "Esterri",  lat: 42.625,  lng: 1.140,  rKm: 5 },
  { id: "Adrall",               label: "Adrall",   lat: 42.3271, lng: 1.4015, rKm: 4 },
];

// Tipus de patrulla. Els colors s'agafen del tema, només l'estructura és constant.
// Els consumidors fan PT[type].color rebent el tema a través de useC.
export const PT_LABELS = {
  mossos:  { label: "Mossos d'Esquadra", short: "MSE", colorKey: "mossos" },
  guardia: { label: "Guardia Civil",     short: "GC",  colorKey: "guardia" },
  local:   { label: "Policia Local",     short: "PL",  colorKey: "local" },
  unknown: { label: "Desconegut",        short: "???", colorKey: "textDim" },
};

// Helper: PT amb colors del tema actual
export const ptWith = (theme) => ({
  mossos:  { ...PT_LABELS.mossos,  color: theme.mossos },
  guardia: { ...PT_LABELS.guardia, color: theme.guardia },
  local:   { ...PT_LABELS.local,   color: theme.local },
  unknown: { ...PT_LABELS.unknown, color: theme.textDim },
});

export const DAYS_SHORT = ["Dg", "Dl", "Dt", "Dc", "Dj", "Dv", "Ds"];
export const DAYS_FULL  = ["Diumenge", "Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte"];
// Ordre de visualització català: dilluns primer, diumenge al final. Els valors són
// índexs de getDay() (0=Dg) perquè les dades segueixen indexades per getDay().
export const DAYS_ORDER_MON = [1, 2, 3, 4, 5, 6, 0];
export const MONTHS     = ["Gener", "Febrer", "Març", "Abril", "Maig", "Juny", "Juliol", "Agost", "Setembre", "Octubre", "Novembre", "Desembre"];
