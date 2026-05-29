// Port directe de backend/extractor.py — sense dependències externes.
// Manté la mateixa lògica de filtres, paraules clau i patrons de zona.

const PATROL_KEYWORDS: Record<string, string[]> = {
  mossos: [
    "mossos", "mosso", "mosus", "gossos", "gossos d'esquadra", "esquadra", "escuadra",
    "mozos", "mozo", "brimos", "brimo", "arro", "arros",
    "policia catalana", "policía catalana", "pitufos negros", "perros", "perro",
    "pasma", "poli", "polis", "policia", "policía", "secreta", "secretas",
  ],
  guardia: [
    "guardia civil", "guardias civiles", "guardia", "gc ", " gc,", "(gc)", "civiles",
    "benemérita", "benemerita", "la benemérita",
    "picoletos", "picoleto", "picolos", "picolo", "picos",
    "tricornio", "tricorni", "verdes", "verde", "verds",
    "lagartos", "lagarto", "aceitunos", "aceituno", "monos", "mono", "malos",
    "policia nacional", "policía nacional", "nacionales", "nacional",
    "maderos", "madero", "la madera", "azules", "azul", "grises", "gris",
  ],
  local: [
    "policia local", "policía local", "municipal", "municipales", "munis", "munios",
    "guardia urbana", "urbana", "urbanos", "urbano", "monillo", "monillos",
    "pitufos", "pitufo", "guindillas", "guindilla", "sheriffs", "sheriff",
    "multa-multa", "plastas", "plasta", "los de tráfico", "trafico", "tráfico",
  ],
};

const PRESENCE_KEYWORDS = [
  "control", "controls", "controles", "controlant", "controlante",
  "patrulla", "patrulles", "patrullas", "patrullant", "patrullante",
  "radar", "radars", "radares",
  "hi ha", "hay", "estan", "están", "está", "es troba", "se encuentra",
  "acaben de", "acaban de",
  "cuidado", "compte", "atenció", "atención", "alerta",
  "pillat", "pillado", "aturat", "parado",
  "multa", "multes", "multas", "multan",
  "fent controls", "haciendo controles",
  "a l'altura", "a la altura", "al km", "kilómetro",
  "rotonda", "semàfor", "semáforo", "semaforo", "cruïlla", "cruce", "cruze",
  "entrada", "sortida", "salida",
  "pk", "punt kilometric", "punto kilométrico", "punto kilometrico",
];

const NEGATIVE_KEYWORDS = [
  "ahir", "ayer", "fa dies", "hace días",
  "la setmana passada", "la semana pasada",
  "ja han marxat", "ya se han ido", "ja no hi són",
  "notícia", "noticia", "diari", "diario",
  "broma", "conya", "fake",
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
};

function normalizeText(text: string): string {
  let t = text.toLowerCase();
  const subs: [string, string][] = [
    ["à","a"],["á","a"],["è","e"],["é","e"],["í","i"],
    ["ï","i"],["ò","o"],["ó","o"],["ú","u"],["ü","u"],
    ["ç","c"],["ñ","n"],
  ];
  for (const [o, r] of subs) t = t.replaceAll(o, r);
  return t;
}

function detectPk(textLower: string): string | null {
  const m = textLower.match(PK_PATTERN);
  return m ? m[0].trim() : null;
}

function detectPatrolType(textLower: string): string {
  for (const [ptype, keywords] of Object.entries(PATROL_KEYWORDS)) {
    for (const kw of keywords) {
      if (textLower.includes(kw)) return ptype;
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
  for (const [pattern, zoneNorm] of ZONE_PATTERNS) {
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

  for (const neg of NEGATIVE_KEYWORDS) {
    if (textLower.includes(neg)) return null;
  }

  const hasPresence = PRESENCE_KEYWORDS.some(kw => textLower.includes(kw));
  const patrolType = detectPatrolType(textLower);
  const hasPatrolWord = patrolType !== "unknown";

  if (!hasPresence && !hasPatrolWord) return null;

  if (hasPatrolWord && !hasPresence) {
    const roadHints = ["km", "pk", "rotonda", "carretera", "carrer", "calle", "avinguda"];
    if (!roadHints.some(h => textLower.includes(h))) return null;
  }

  const { zoneLiteral, zoneNorm, lat, lng } = detectZone(textLower);
  const pk = detectPk(textLower);
  const confidence = calcConfidence(textLower, patrolType, zoneNorm);

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
