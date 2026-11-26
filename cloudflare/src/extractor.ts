// Port directe de backend/extractor.py — sense dependències externes.
// Manté la mateixa lògica de filtres, paraules clau i patrons de zona.

const PATROL_KEYWORDS: Record<string, string[]> = {
  mossos: [
    "mossos", "mosso", "mosus", "gossos d'esquadra",
    "policia catalana", "policía catalana",
    "esquadra", "escuadra", "mozos", "brimo", "pasma",
    "pitufos", "pitufo", "pitufs",
  ],
  guardia: [
    "guardia civil", "guardias civiles", "guardia", "gc",
    "benemérita", "benemerita",
    "tricornio", "tricorni", "picoleto", "picolos",
    "policia nacional", "policía nacional", "nacionales",
    "madero", "la madera",
    "civils", "civiles", "verds", "los verdes", "picos",
  ],
  local: [
    "policia local", "policía local",
    "policia municipal", "els municipals", "los municipales", "municipales", "munis",
    "guardia urbana", "urbana", "urbanos", "guindilla",
  ],
};

const PRESENCE_KEYWORDS = [
  "control", "controls", "controles", "controlant",
  "patrulla", "patrulles", "patrullas", "patrullant",
  "radar", "radars", "radares",
  "hi ha", "hay", "estan", "están", "está", "es troba", "se encuentra",
  "acaben de", "acaban de",
  "cuidado", "compte", "atenció", "atención", "alerta",
  "pillat", "pillado", "aturat", "parado",
  "multa", "multes", "multas", "multan",
  "fent controls", "haciendo controles",
  "a l'altura", "a la altura", "al km", "kilómetro",
  "rotonda", "semàfor", "semáforo", "semaforo", "cruïlla", "cruce",
  "entrada", "sortida", "salida",
  "pk", "punt kilometric", "punto kilometrico", "punto kilométrico",
  // Verbs i expressions habituals als grups
  "parats", "parades", "parados", "aturats", "aturades", "posats", "puestos", "apostats", "apostados",
  "sortint", "saliendo", "entrant", "entrando", "baixant", "bajando", "pujant", "subiendo",
  "altura", "alcada", "direccio", "direccion", "sentit", "sentido", "prop de", "cerca de",
  "ull", "ojo", "ojito", "vigileu", "vigilad", "atents", "atentos",
  "alcoholemia", "alcoholemies", "drogotest", "atestat", "atestado", "cotxe", "coche", "furgo", "furgoneta",
  "camuflat", "camuflats", "camuflado", "camuflados", "paisano", "de paisa",
];

const NEGATIVE_KEYWORDS = [
  "ahir", "ayer", "fa dies", "hace días",
  "la setmana passada", "la semana pasada",
  "ja han marxat", "ya se han ido", "ja no hi són",
  "notícia", "noticia", "diari", "diario",
  "broma", "conya", "fake",
  // Negacions: avisen que NO hi ha res
  "no hi ha", "no n'hi ha", "no hay", "ja no", "ya no", "via lliure", "via libre",
  "tot net", "todo limpio", "esta net", "esta limpio", "han marxat", "se han ido", "se fueron",
  "han plegat", "ja han passat", "ya han pasado", "ni rastre", "ni rastro", "res de res",
  // Notificacions del sistema de WhatsApp/Telegram (no són missatges de ningú)
  "comprobando si hay mensajes", "comprovant si hi ha missatges", "checking for new messages",
  "mensajes nuevos", "missatges nous", "new messages", "nuevos mensajes",
  "copia de seguridad", "copia de seguretat", "llamada perdida", "trucada perduda",
  "videollamada", "videotrucada", "whatsapp web", "mensajes de ", "missatges de ",
];

const STRONG_KEYWORDS = [
  "control", "radar", "patrull", "alcoholemi", "drogotest", "atestat", "atestado", "camuflat", "camuflad",
];
const STRONG_NORM = STRONG_KEYWORDS.map(normalizeText);
// "Policia a Sort", "poli a la rotonda": policia sense dir quin cos (tipus desconegut)
const POLICE_WORDS = ["policia", "policies", "policias", "poli", "polis", "poliz"];

// Argot dels grups: "rotonda bruta" = hi ha control; "neta" = ja han marxat (vegeu
// classifyFollowUp). "Brut/bruta" només compta si diu on (zona coneguda o un lloc de
// carretera) i no parla de neu, fang... ("carretera bruta de neu" no és cap avís).
const DIRTY_WORDS = new Set(["brut", "bruta", "bruts", "brutes", "brutissima", "brutissim", "sucio", "sucia", "sucios", "sucias"]);
const DIRTY_PLACES = ["rotonda", "entrada", "sortida", "salida", "carretera", "cruilla", "cruce", "km", "pk",
  "pont", "puente", "tunel", "recta", "revolt", "curva", "benzinera", "gasolinera", "poligon", "pujada", "baixada",
  "subida", "bajada", "variant", "variante", "autovia"];
const DIRTY_NOT = ["neu", "nieve", "fang", "barro", "gel", "hielo", "terra", "tierra", "pedres", "piedras", "oli", "aceite",
  "gravilla", "grava", "fulles", "hojas", "roba", "ropa", "cotxe brut", "coche sucio"];
function dirtyWord(text: string): boolean {
  return text.replace(/[^a-z0-9ñç]+/g, " ").split(" ").some((w) => DIRTY_WORDS.has(w));
}

// Preguntes ("hi ha mossos a ...?", "algú sap si...") no són avisos.
const QUESTION_STARTS = [
  "algu sap", "alguien sabe", "sabeu si", "sabeis si", "algu ha vist", "alguien ha visto",
  "hi ha algo", "hay algo", "com esta", "como esta",
];

const PK_PATTERN = /\b(?:pk|km|k\.m\.)\s*\.?\s*(\d+(?:[.,]\d+)?)\b/i;

// [pattern, zone_norm]
const ZONE_PATTERNS: [RegExp, string][] = [
  // Carreteres principals
  [/\bN-?II\b|\bnacional\s*2\b|\bnacional\s*ii\b/i, "N-II"],
  [/\bC-?13\b/i, "C-13"],
  [/\bC-?14\b/i, "C-14"],
  [/\bC-?26\b/i, "C-26"],
  [/\bC-?12\b/i, "C-12"],
  [/\bC-?25\b/i, "C-25"],
  [/\bC-?28\b/i, "C-28"],
  [/\bC-?1412\b/i, "C-1412"],
  [/\bA-?2\b|\bautopista\b/i, "A-2"],
  [/\bL-?511\b/i, "L-511"],
  [/\bL-?512\b/i, "L-512"],
  [/\bL-?513\b/i, "L-513"],
  [/\bN-?260\b/i, "N-260"],

  // Lleida ciutat barris
  [/\bcappont\b/i, "Lleida - Cappont"],
  [/\bbal[aà]fia\b|\bbalafia\b/i, "Lleida - Balàfia"],
  [/\bpartida\s*alta\b/i, "Lleida - Partida Alta"],
  [/\bla\s*bordeta\b|\bbordeta\b/i, "Lleida - La Bordeta"],
  [/\bmagdalena\b/i, "Lleida - La Magdalena"],
  [/\bcorregidor\b/i, "Lleida - El Corregidor"],
  [/\bcarrer\s*major\b|\brambla\s*ferran\b|\bseu\s*vella\b/i, "Lleida - Centre"],
  [/\blleida\b/i, "Lleida - Centre"],

  // Alt Urgell
  [/\bla\s*seu\b|\bseu\s*d['"]urgell\b|\burgell\b/i, "La Seu d'Urgell"],
  [/\borganya\b|\borganyà\b/i, "Organyà"],
  [/\boliana\b/i, "Oliana"],
  [/\bpont\s*de\s*bar\b/i, "Pont de Bar"],

  // Alta Ribagorça
  [/\bvielha\b|\bviella\b|\bval\s*d['"]aran\b/i, "Vielha"],
  [/\bpont\s*de\s*suert\b|\bsuert\b/i, "Pont de Suert"],

  // Pallars Jussà
  [/\btremp\b/i, "Tremp"],
  [/\bisona\b/i, "Isona"],
  [/\bla\s*pobla\s*de\s*segur\b|\bpobla\s*de\s*segur\b/i, "La Pobla de Segur"],
  [/\bsalàs\b|\bsalas\b/i, "Salàs de Pallars"],
  [/\bcamarasa\b/i, "Camarasa"],
  [/\bcoll\s*de\s*nargó\b/i, "Coll de Nargó"],

  // Pallars Sobirà
  [/\bsort\b/i, "Sort"],
  [/\besterri\b/i, "Esterri d'Àneu"],
  [/\bla\s*guingueta\b|\bguingueta\b/i, "La Guingueta d'Àneu"],
  [/\brialp\b/i, "Rialp"],
  [/\bgerri\b/i, "Gerri de la Sal"],
  [/\bllavorsí\b|\bllavors[ií]\b/i, "Llavorsí"],
  [/\btírvia\b|\btirvoa\b/i, "Tírvia"],

  // Valls del Pallars Sobirà i Alt Urgell (afegits; coordenades de Mapbox)
  [/\bvall\s*ferrera\b|\balins\b/i, "Vall Ferrera (Alins)"],
  [/\bareu\b/i, "Àreu"],
  [/\bvall\s*de\s*cardos\b|\bvall\s*cardos\b|\bribera\s*de\s*cardos\b|\bcardos\b/i, "Vall de Cardós"],
  [/\btavascan\b/i, "Tavascan"],
  [/\bespot\b/i, "Espot"],
  [/\bescalo\b/i, "Escaló"],
  [/\bllessui\b/i, "Llessui"],
  [/\bsenterada\b/i, "Senterada"],
  [/\badrall\b/i, "Adrall"],
  [/\btornafort\b/i, "Tornafort"],
  [/\bcastellciutat\b/i, "Castellciutat"],
  [/\bmartinet\b/i, "Martinet"],
  [/\bnoves\s*de\s*segre\b/i, "Noves de Segre"],

  // Noguera
  [/\bbalaguer\b/i, "Balaguer"],
  [/\bbellcaire\b/i, "Bellcaire d'Urgell"],
  [/\bàger\b|\bager\b/i, "Àger"],
  [/\bartesa\b|\bartes[aà]\b/i, "Artesa de Segre"],
  [/\bcubells\b/i, "Cubells"],
  [/\bmenarguens\b|\bmenàrguens\b/i, "Menàrguens"],
  [/\bos\s*de\s*balaguer\b|\bos\s*balaguer\b/i, "Os de Balaguer"],
  [/\bpons\b|\bponts\b/i, "Ponts"],
  [/\bsanta\s*linya\b/i, "Santa Linya"],
  [/\bvila-sana\b|\bvilasana\b/i, "Vila-sana"],

  // Segarra
  [/\bcervera\b/i, "Cervera"],
  [/\bcalaf\b/i, "Calaf"],
  [/\bguissona\b/i, "Guissona"],
  [/\bsanaüja\b|\bsanauia\b/i, "Sanaüja"],
  [/\btorà\b|\btora\b/i, "Torà"],

  // Segrià
  [/\bmollerussa\b/i, "Mollerussa"],
  [/\balcarràs\b|\balcarras\b/i, "Alcarràs"],
  [/\balfés\b|\balfes\b/i, "Alfés"],
  [/\balguaire\b/i, "Alguaire"],
  [/\baltorricó\b|\baltorrico\b/i, "Altorricó"],
  [/\balmacelles\b/i, "Almacelles"],
  [/\bartesa\s*de\s*lleida\b/i, "Artesa de Lleida"],
  [/\bgranadella\b|\bla\s*granadella\b/i, "La Granadella"],
  [/\bla\s*granja\s*d['"]escarp\b|\bgranja\s*escarp\b/i, "La Granja d'Escarp"],
  [/\bmaials\b/i, "Maials"],
  [/\bpuigverd\b/i, "Puigverd de Lleida"],
  [/\brossell[oó]\b/i, "Rosselló"],
  [/\bseros\b|\bseròs\b/i, "Seròs"],
  [/\bsudanell\b/i, "Sudanell"],
  [/\bsunyer\b/i, "Sunyer"],
  [/\btorrefarrera\b/i, "Torrefarrera"],
  [/\btorrebesses\b/i, "Torrebesses"],
  [/\btorregrossa\b/i, "Torregrossa"],
  [/\btorrent\b/i, "Torrent"],
  [/\bvilanova\s*de\s*segrià\b|\bvilanova\s*segria\b/i, "Vilanova de Segrià"],

  // Urgell
  [/\bt[aà]rrega\b|\btarrega\b/i, "Tàrrega"],
  [/\bbellpuig\b/i, "Bellpuig"],
  [/\bel\s*talladell\b|\btalladell\b/i, "El Talladell"],
  [/\bguimerà\b|\bguimera\b/i, "Guimerà"],
  [/\bl['"]espluga\s*calba\b|\bespluga\s*calba\b/i, "L'Espluga Calba"],
  [/\bpreixana\b/i, "Preixana"],
  [/\bsant\s*martí\s*de\s*riucorb\b/i, "Sant Martí de Riucorb"],
  [/\bverdu\b|\bverdú\b/i, "Verdú"],
  [/\bvilagrassa\b/i, "Vilagrassa"],

  // Pla d'Urgell
  [/\bbells-lloc\b|\bbellsloc\b/i, "Bell-lloc d'Urgell"],
  [/\bbellvís\b|\bbellvis\b/i, "Bellvís"],
  [/\bfondarella\b/i, "Fondarella"],
  [/\bgolmés\b|\bgolmes\b/i, "Golmés"],
  [/\bmiralcamp\b/i, "Miralcamp"],
  [/\bpalau\s*d['"]anglesola\b|\bpalau\s*anglesola\b/i, "Palau d'Anglesola"],
  [/\bpoal\b/i, "El Poal"],

  // Garrigues
  [/\bborges\s*blanques\b|\bborges\b|\bles\s*borges\b/i, "Les Borges Blanques"],
  [/\barb[eè]ca\b|\barbeca\b/i, "Arbeca"],
  [/\bl['"]albi\b|\balbi\b/i, "L'Albi"],
  [/\bjuncosa\b/i, "Juncosa"],
  [/\bla\s*pobla\s*de\s*c[eè]rvoles\b|\bcervoles\b/i, "La Pobla de Cérvoles"],
  [/\bvinaixa\b/i, "Vinaixa"],

  // Conca de Barberà (límit)
  [/\bmontblanc\b/i, "Montblanc"],

  // Referències genèriques
  [/\bpeatge\b|\bpeaje\b/i, "A-2 (peatge)"],
  [/\baeroport\b|\baeroporto\b|\baeroproto\b/i, "Aeroport de Lleida"],
  // "la Pobla" sola: a la zona de l'app és gairebé sempre la Pobla de Segur
  [/\bpobla\b/i, "La Pobla de Segur"],
];

export const ZONE_COORDS: Record<string, [number, number]> = {
  "N-II":                    [41.615, 0.620],
  "C-13":                    [41.850, 0.950],
  "C-14":                    [41.990, 1.030],
  "C-26":                    [41.790, 0.810],
  "C-12":                    [41.200, 0.600],
  "C-25":                    [41.900, 1.200],
  "C-28":                    [42.700, 0.800],
  "A-2":                     [41.580, 0.490],
  "N-260":                   [42.400, 1.200],
  "Lleida - Centre":         [41.614, 0.627],
  "Lleida - Cappont":        [41.610, 0.610],
  "Lleida - Balàfia":        [41.625, 0.635],
  "Lleida - La Bordeta":     [41.605, 0.615],
  "Lleida - La Magdalena":   [41.618, 0.632],
  "Lleida - Partida Alta":   [41.622, 0.638],
  "Lleida - El Corregidor":  [41.600, 0.608],
  "Mollerussa":              [41.625, 0.893],
  "Tàrrega":                 [41.645, 1.139],
  "Balaguer":                [41.791, 0.811],
  "La Seu d'Urgell":         [42.358, 1.457],
  "Tremp":                   [42.167, 0.900],
  "Cervera":                 [41.668, 1.272],
  "Les Borges Blanques":     [41.517, 0.866],
  "Ponts":                   [41.920, 1.195],
  "Artesa de Segre":         [41.899, 1.048],
  "Sort":                    [42.412, 1.128],
  "Vielha":                  [42.700, 0.795],
  "Pont de Suert":           [42.400, 0.745],
  "La Pobla de Segur":       [42.247, 0.972],
  "Isona":                   [42.050, 1.050],
  "Esterri d'Àneu":          [42.625, 1.140],
  "Rialp":                   [42.357, 1.110],
  "Alcarràs":                [41.569, 0.535],
  "Alguaire":                [41.771, 0.577],
  "Almacelles":              [41.718, 0.449],
  "Guissona":                [41.791, 1.305],
  "Bellpuig":                [41.619, 1.012],
  "Organyà":                 [42.218, 1.333],
  "Oliana":                  [42.072, 1.317],
  "Calaf":                   [41.727, 1.513],
  "Arbeca":                  [41.505, 1.034],
  "Rosselló":                [41.827, 0.698],
  "Torrefarrera":            [41.698, 0.637],
  "Torregrossa":             [41.590, 0.906],
  "Seròs":                   [41.459, 0.402],
  "Golmés":                  [41.656, 0.956],
  "Verdú":                   [41.616, 1.157],
  "Llavorsí":                [42.490, 1.215],
  "Camarasa":                [41.990, 0.877],
  "Menàrguens":              [41.860, 0.757],
  "Aeroport de Lleida":      [41.728, 0.535],
  // Coordenades obtingudes amb Mapbox (geocodificació, 2026-11)
  "Vall Ferrera (Alins)":    [42.5489, 1.3174],
  "Àreu":                    [42.5886, 1.3267],
  "Vall de Cardós":          [42.5634, 1.2263],
  "Tavascan":                [42.6434, 1.2567],
  "Tírvia":                  [42.5149, 1.2428],
  "Gerri de la Sal":         [42.3235, 1.0648],
  "La Guingueta d'Àneu":     [42.5945, 1.1318],
  "Espot":                   [42.5754, 1.0897],
  "Escaló":                  [42.5497, 1.1563],
  "Llessui":                 [42.4511, 1.0735],
  "Coll de Nargó":           [42.1719, 1.3133],
  "Pont de Bar":             [42.3588, 1.6394],
  "Salàs de Pallars":        [42.2113, 0.9322],
  "Senterada":               [42.3243, 0.9366],
  "Adrall":                  [42.3271, 1.4015],
  "Tornafort":               [42.3687, 1.1398],
  "Castellciutat":           [42.3541, 1.4436],
  "Martinet":                [42.3597, 1.6956],
  "Noves de Segre":          [42.2939, 1.3422],
};

function normalizeText(text: string): string {
  let t = text.toLowerCase();
  const subs: [string, string][] = [
    ["à","a"],["á","a"],["è","e"],["é","e"],["í","i"],
    ["ï","i"],["ò","o"],["ó","o"],["ú","u"],["ü","u"],
    ["ç","c"],["ñ","n"],
  ];
  for (const [o, r] of subs) t = t.replaceAll(o, r);
  // Lletres allargades dels xats: "brutaaa" → "bruta", "mossooos" → "mossos", "siii" → "si"
  t = t.replace(/([a-z])\1{2,}/g, "$1").replace(/([aeiou])\1+(?=[^a-z]|$)/g, "$1");
  return t;
}

// El text es normalitza sense accents (normalizeText), així que els patrons amb accents
// obligatoris (p. ex. "coll de nargó", "llavorsí") no coincidien mai. Es normalitzen
// un cop aquí. Només usen \b i \s, que no canvien en passar a minúscules.
const ZONE_PATTERNS_NORM: [RegExp, string][] = ZONE_PATTERNS.map(
  ([re, zone]) => [new RegExp(normalizeText(re.source), re.flags), zone],
);

function detectPk(textLower: string): string | null {
  const m = textLower.match(PK_PATTERN);
  return m ? m[0].trim() : null;
}

// Les llistes s'escriuen amb accents per llegibilitat; el text arriba sense accents.
const PATROL_KEYWORDS_NORM: [string, string[]][] = Object.entries(PATROL_KEYWORDS)
  .map(([k, list]) => [k, list.map(normalizeText)]);
const PRESENCE_NORM = PRESENCE_KEYWORDS.map(normalizeText);
const NEGATIVE_NORM = NEGATIVE_KEYWORDS.map(normalizeText);

// Paraules curtes ("ull", "ojo", "hay", "pk") només compten com a paraula sencera:
// si no, "full", "rojo" o "whay" farien saltar el filtre.
const SHORT_WORD_RE = new Map<string, RegExp>();
function hasKeyword(text: string, kw: string): boolean {
  if (kw.trim().length > 5 || kw !== kw.trim()) return text.includes(kw);
  let re = SHORT_WORD_RE.get(kw);
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
    SHORT_WORD_RE.set(kw, re);
  }
  return re.test(text);
}

function detectPatrolType(textLower: string): string {
  for (const [ptype, keywords] of PATROL_KEYWORDS_NORM) {
    for (const kw of keywords) {
      if (hasKeyword(textLower, kw)) return ptype;
    }
  }
  return "unknown";
}

function detectZone(textLower: string): {
  zoneLiteral: string;
  zoneNorm: string;
  lat: number | null;
  lng: number | null;
} {
  for (const [pattern, zoneNorm] of ZONE_PATTERNS_NORM) {
    const m = textLower.match(pattern);
    if (m) {
      const coords = ZONE_COORDS[zoneNorm];
      return {
        zoneLiteral: m[0],
        zoneNorm,
        lat: coords ? coords[0] : null,
        lng: coords ? coords[1] : null,
      };
    }
  }
  return { zoneLiteral: "", zoneNorm: "Desconeguda", lat: null, lng: null };
}

function calcConfidence(textLower: string, patrolType: string, zoneNorm: string): string {
  let score = 0;
  if (patrolType !== "unknown") score += 2;
  if (zoneNorm !== "Desconeguda") score += 1;
  const strong = ["control", "radar", "patrulla", "cuidado", "compte", "alerta"];
  if (strong.some(kw => textLower.includes(kw))) score += 2;
  if (textLower.length > 30) score += 1;
  if (score >= 5) return "alta";
  if (score >= 3) return "mitja";
  return "baixa";
}

export interface PatrolInfo {
  is_patrol: true;
  patrol_type: string;
  zone: string;
  zone_norm: string;
  pk: string | null;
  confidence: string;
  lat: number | null;
  lng: number | null;
  source: string;
}

export function extractPatrolInfo(message: string, source: string = "unknown"): PatrolInfo | null {
  if (!message || message.trim().length < 5) return null;

  const textLower = normalizeText(message);

  for (const neg of NEGATIVE_NORM) {
    if (textLower.includes(neg)) return null;
  }
  const trimmed = textLower.trim();
  if (trimmed.endsWith("?") || QUESTION_STARTS.some(q => trimmed.startsWith(q))) return null;

  const hasPresence = PRESENCE_NORM.some(kw => hasKeyword(textLower, kw));
  const patrolType = detectPatrolType(textLower);
  const hasPatrolWord = patrolType !== "unknown";
  const { zoneLiteral, zoneNorm, lat, lng } = detectZone(textLower);
  const hasZone = zoneNorm !== "Desconeguda";

  // "Rotonda de Sort bruta": sense cos policial ni "control", però en argot vol dir que n'hi ha.
  const police = !hasPatrolWord && POLICE_WORDS.some((w) => hasKeyword(textLower, w));
  const dirty = !hasPatrolWord && dirtyWord(textLower) && !DIRTY_NOT.some((w) => hasKeyword(textLower, w))
    && (hasZone || DIRTY_PLACES.some((w) => hasKeyword(textLower, w)));
  if (!hasPresence && !hasPatrolWord && !police && !dirty) return null;

  // Sense cos policial, cal una paraula forta ("control", "radar"...): "està" o "hi ha"
  // sols no fan d'un missatge qualsevol un avís.
  if (!hasPatrolWord && !police && !dirty && !STRONG_NORM.some(kw => textLower.includes(kw))) return null;

  // Cos policial + lloc conegut ja és un avís ("Mossos a Organyà").
  if ((hasPatrolWord || police) && !hasPresence && !hasZone) {
    const roadHints = ["km", "pk", "rotonda", "carretera", "carrer", "calle", "avinguda"];
    if (!roadHints.some(h => textLower.includes(h))) return null;
  }

  const pk = detectPk(textLower);
  const confidence = dirty ? (hasZone ? "mitja" : "baixa") : calcConfidence(textLower, patrolType, zoneNorm);

  let zoneDisplay = zoneLiteral || zoneNorm;
  if (pk && zoneNorm !== "Desconeguda") zoneDisplay = `${zoneNorm} (${pk})`;

  return {
    is_patrol: true,
    patrol_type: patrolType,
    zone: zoneDisplay,
    zone_norm: zoneNorm,
    pk,
    confidence,
    lat,
    lng,
    source,
  };
}

// ── Seguiment d'un avís ja donat ─────────────────────────────────────────────
// Missatges que no són un avís nou però diuen alguna cosa d'un control que ja s'ha
// avisat: "segueixen de pujada" (encara hi són), "ja han marxat", "fins Escaló net"
// (ja no hi són), "encara estan?" (pregunta) i les respostes curtes "sí" / "no".
// Serveixen per mesurar QUANTA ESTONA dura un control (entre el primer avís i el
// "ja han marxat") i afinar la possibilitat. Només s'usen si extractPatrolInfo diu
// que el missatge NO és un avís nou.
export type FollowUpKind = "still" | "cleared" | "ask" | "yes" | "no";
export interface FollowUp {
  kind: FollowUpKind;
  zone_norm: string | null;
  patrol_type: string;
}

const CLEARED_PHRASES = [
  "ja han marxat", "ya se han ido", "ja no hi son", "ja no hi es", "ja no estan", "ya no estan",
  "ya no hay nada", "ya no hay nadie", "ja no hi ha res", "ja no hi ha ningu",
  "han marxat", "se han ido", "se fueron", "se han largado", "han plegat", "han recollit",
  "han recogido", "estan recollint", "estan recogiendo", "ja han passat", "ya han pasado",
  "no hi ha ningu", "no hay nadie", "no hi ha res", "no hay nada", "ni rastre", "ni rastro",
  "res de res", "tot net", "todo limpio", "esta net", "esta limpio", "via lliure", "via libre",
].map(normalizeText);
// Paraula sola en un missatge curt: "Fins Escaló net", "Sort limpio"
const CLEARED_WORDS = new Set(["net", "neta", "nets", "lliure", "limpio", "limpia", "despejado", "despejada"]);

const STILL_PHRASES = [
  "segueixen", "segueix ", "continuen", "encara hi son", "encara estan", "encara hi ha",
  "encara hi es", "encara paren", "siguen", "todavia estan", "todavia siguen", "aun estan",
  "aun siguen", "ahi siguen", "alli siguen", "alla estan", "alli estan",
].map(normalizeText);
// Inici de missatge curt que parla d'ells en present: "Estan de palique.."
const STILL_STARTS = ["estan", "hi son", "siguen", "sigue", "segueix", "brut", "bruta", "sucio", "sucia", "continua bruta"];

// Pregunta que espera un sí/no sobre un control avisat abans
const ASK_WORDS = ["encara", "todavia", "aun", "segueixen", "siguen", "continuen", "hi son", "estan", "siguen ahi",
  "brut", "bruta", "net", "neta", "sucia", "limpia", "limpio"];
const YES_ANSWERS = new Set(["si", "sip", "sii", "siii", "si si", "encara", "encara si", "si encara",
  "segueixen", "siguen", "aun", "aun si", "todavia", "si todavia", "afirmatiu", "yes", "ahi siguen"]);
const NO_ANSWERS = new Set(["no", "nop", "noo", "nooo", "no no", "ja no", "ya no", "cap", "res", "nada",
  "negatiu", "no hi son", "no estan"]);

const PAST_HINTS = ["ahir", "ayer", "fa dies", "hace dias", "la setmana passada", "la semana pasada"];

export function classifyFollowUp(message: string): FollowUp | null {
  if (!message) return null;
  const text = normalizeText(message).trim();
  if (!text || text.length > 160) return null;
  const words = text.replace(/[^a-z0-9ñç]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const bare = words.join(" ");
  const zone = detectZone(text).zoneNorm;
  const out = (kind: FollowUpKind): FollowUp => ({
    kind,
    zone_norm: zone !== "Desconeguda" ? zone : null,
    patrol_type: detectPatrolType(text),
  });

  if (text.endsWith("?")) {
    return words.length <= 8 && ASK_WORDS.some((w) => hasKeyword(bare, w)) ? out("ask") : null;
  }
  if (YES_ANSWERS.has(bare)) return out("yes");
  if (NO_ANSWERS.has(bare)) return out("no");
  if (PAST_HINTS.some((p) => text.includes(p))) return null;

  if (CLEARED_PHRASES.some((p) => text.includes(p))) return out("cleared");
  if (words.length <= 8 && words.some((w) => CLEARED_WORDS.has(w))) return out("cleared");

  if (STILL_PHRASES.some((p) => hasKeyword(bare + " ", p))) return out("still");
  if (words.length <= 6 && STILL_STARTS.some((s) => bare === s || bare.startsWith(s + " "))) return out("still");
  return null;
}
