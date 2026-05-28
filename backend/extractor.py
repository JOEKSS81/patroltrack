"""
Extractor de patrulles GRATUÏT — sense API
Versió ampliada amb tots els municipis de Lleida +200 habitants i PKs
"""

import re

PATROL_KEYWORDS = {
    "mossos": [
        "mossos", "mosso",
        "policia catalana", "policía catalana",
        "esquadra",
    ],
    "guardia": [
        "guardia civil", "guardia", "gc ", " gc,", "(gc)",
        "benemérita", "benemerita",
        "tricornio", "tricorni",
    ],
    "local": [
        "policia local", "policía local",
        "municipal", "munis",
        "guardia urbana", "urbana",
    ],
}

PRESENCE_KEYWORDS = [
    "control", "controls", "controlant",
    "patrulla", "patrulles", "patrullant",
    "radar", "radars",
    "hi ha", "hay", "estan", "están", "está", "es troba",
    "acaben de", "acaban de",
    "cuidado", "compte", "atenció", "atención", "alerta",
    "pillat", "pillado", "aturat", "parado",
    "multa", "multes", "multan",
    "fent controls", "haciendo controles",
    "a l'altura", "a la altura", "al km", "kilómetro",
    "rotonda", "semàfor", "semaforo", "cruïlla", "cruce",
    "entrada", "sortida", "salida",
    "pk", "punt kilometric", "punto kilometrico",
]

NEGATIVE_KEYWORDS = [
    "ahir", "ayer", "fa dies", "hace días",
    "la setmana passada", "la semana pasada",
    "ja han marxat", "ya se han ido", "ja no hi són",
    "notícia", "noticia", "diari", "diario",
    "broma", "conya", "fake",
]

# Patrons PK — detecta "km 45", "pk 123", "km45", etc.
PK_PATTERN = re.compile(r'\b(?:pk|km|k\.m\.)\s*\.?\s*(\d+(?:[.,]\d+)?)\b', re.IGNORECASE)

ZONE_PATTERNS = [
    # Carreteres principals
    (r'\bN-?II\b|\bnacional\s*2\b|\bnacional\s*ii\b', "N-II"),
    (r'\bC-?13\b', "C-13"),
    (r'\bC-?14\b', "C-14"),
    (r'\bC-?26\b', "C-26"),
    (r'\bC-?12\b', "C-12"),
    (r'\bC-?25\b', "C-25"),
    (r'\bC-?28\b', "C-28"),
    (r'\bC-?1412\b', "C-1412"),
    (r'\bA-?2\b|\bautopista\b', "A-2"),
    (r'\bL-?511\b', "L-511"),
    (r'\bL-?512\b', "L-512"),
    (r'\bL-?513\b', "L-513"),
    (r'\bN-?260\b', "N-260"),

    # Lleida ciutat barris
    (r'\bcappont\b', "Lleida - Cappont"),
    (r'\bbal[aà]fia\b|\bbalafia\b', "Lleida - Balàfia"),
    (r'\bpartida\s*alta\b', "Lleida - Partida Alta"),
    (r'\bla\s*bordeta\b|\bbordeta\b', "Lleida - La Bordeta"),
    (r'\bmagdalena\b', "Lleida - La Magdalena"),
    (r'\bcorregidor\b', "Lleida - El Corregidor"),
    (r'\bcarrer\s*major\b|\brambla\s*ferran\b|\bseu\s*vella\b', "Lleida - Centre"),
    (r'\blleida\b', "Lleida - Centre"),

    # Comarques i municipis — Alt Urgell
    (r'\bla\s*seu\b|\bseu\s*d[\'"]urgell\b|\burgell\b', "La Seu d'Urgell"),
    (r'\borganya\b|\borganyà\b', "Organyà"),
    (r'\boliana\b', "Oliana"),
    (r'\bpont\s*de\s*bar\b', "Pont de Bar"),
    (r'\bfigols\b', "Fígols i Alinyà"),

    # Alta Ribagorça
    (r'\bvielha\b|\bviella\b|\bval\s*d[\'"]aran\b', "Vielha"),
    (r'\bpont\s*de\s*suert\b|\bsuert\b', "Pont de Suert"),
    (r'\bbono\b', "Bonansa"),

    # Pallars Jussà
    (r'\btremp\b', "Tremp"),
    (r'\bisona\b', "Isona"),
    (r'\bla\s*pobla\s*de\s*segur\b|\bpobla\s*de\s*segur\b', "La Pobla de Segur"),
    (r'\bsalàs\b|\bsalas\b', "Salàs de Pallars"),
    (r'\bcamarasa\b', "Camarasa"),
    (r'\bguardia\s*de\s*noguera\b', "Guardia de Noguera"),
    (r'\bcoll\s*de\s*nargó\b', "Coll de Nargó"),

    # Pallars Sobirà
    (r'\bsort\b', "Sort"),
    (r'\besterri\b', "Esterri d'Àneu"),
    (r'\bla\s*guingueta\b|\bguingueta\b', "La Guingueta d'Àneu"),
    (r'\brialp\b', "Rialp"),
    (r'\bgerri\b', "Gerri de la Sal"),
    (r'\bllavorsí\b|\bllavors[ií]\b', "Llavorsí"),
    (r'\btírvia\b|\btirvoa\b', "Tírvia"),

    # Noguera
    (r'\bbalaguer\b', "Balaguer"),
    (r'\bbellcaire\b', "Bellcaire d'Urgell"),
    (r'\bàger\b|\bager\b', "Àger"),
    (r'\bartesa\b|\bartes[aà]\b', "Artesa de Segre"),
    (r'\bcubells\b', "Cubells"),
    (r'\bgranyanella\b', "Granyanella"),
    (r'\bla\s*baronia\b|\bbaronia\b', "La Baronia de Rialb"),
    (r'\blos\s*masos\b', "Els Masos de Veí"),
    (r'\bmenarguens\b|\bmenàrguens\b', "Menàrguens"),
    (r'\bos\s*de\s*balaguer\b|\bos\s*balaguer\b', "Os de Balaguer"),
    (r'\bpons\b|\bponts\b', "Ponts"),
    (r'\bpobla\s*de\s*segur\b', "La Pobla de Segur"),
    (r'\bsanta\s*linya\b', "Santa Linya"),
    (r'\btibau\b|\btibau\b', "Tiurana"),
    (r'\bvila-sana\b|\bvilasana\b', "Vila-sana"),

    # Segarra
    (r'\bcervera\b', "Cervera"),
    (r'\bcalaf\b', "Calaf"),
    (r'\bguissona\b', "Guissona"),
    (r'\bsanaüja\b|\bsanauia\b', "Sanaüja"),
    (r'\btorà\b|\btora\b', "Torà"),
    (r'\bprats\s*de\s*rei\b', "Els Prats de Rei"),
    (r'\bpinell\b', "El Pinell de Brai"),
    (r'\bcivit\b', "Civit"),

    # Segrià
    (r'\bmollerussa\b', "Mollerussa"),
    (r'\balcarràs\b|\balcarras\b', "Alcarràs"),
    (r'\balfés\b|\balfes\b', "Alfés"),
    (r'\balguaire\b', "Alguaire"),
    (r'\baltorricó\b|\baltorrico\b', "Altorricó"),
    (r'\balmacelles\b', "Almacelles"),
    (r'\bartesa\s*de\s*lleida\b', "Artesa de Lleida"),
    (r'\bgranadella\b|\bla\s*granadella\b', "La Granadella"),
    (r'\bla\s*granja\s*d[\'"]escarp\b|\bgranja\s*escarp\b', "La Granja d'Escarp"),
    (r'\bmaials\b', "Maials"),
    (r'\bossa\s*de\s*baix\b', "Ossa de Baix"),
    (r'\bpuigverd\b', "Puigverd de Lleida"),
    (r'\brossell[oó]\b', "Rosselló"),
    (r'\bseros\b|\bseròs\b', "Seròs"),
    (r'\bsudanell\b', "Sudanell"),
    (r'\bsunyer\b', "Sunyer"),
    (r'\btorrefarrera\b', "Torrefarrera"),
    (r'\btorrebesses\b', "Torrebesses"),
    (r'\btorregrossa\b', "Torregrossa"),
    (r'\btorrent\b', "Torrent"),
    (r'\bvilanova\s*de\s*segrià\b|\bvilanova\s*segria\b', "Vilanova de Segrià"),

    # Urgell
    (r'\bt[aà]rrega\b|\btarrega\b', "Tàrrega"),
    (r'\bàger\b', "Àger"),
    (r'\bbellpuig\b', "Bellpuig"),
    (r'\bel\s*talladell\b|\btalladell\b', "El Talladell"),
    (r'\bguimerà\b|\bguimera\b', "Guimerà"),
    (r'\bl[\'"]espluga\s*calba\b|\bespluga\s*calba\b', "L'Espluga Calba"),
    (r'\bpreixana\b', "Preixana"),
    (r'\bsant\s*martí\s*de\s*riucorb\b', "Sant Martí de Riucorb"),
    (r'\bverdu\b|\bverdú\b', "Verdú"),
    (r'\bvilagrassa\b', "Vilagrassa"),

    # Pla d'Urgell
    (r'\bmollerussa\b', "Mollerussa"),
    (r'\bbells-lloc\b|\bbellsloc\b', "Bell-lloc d'Urgell"),
    (r'\bbellvís\b|\bbellvis\b', "Bellvís"),
    (r'\bfondarella\b', "Fondarella"),
    (r'\bgolmés\b|\bgolmes\b', "Golmés"),
    (r'\bmiralcamp\b', "Miralcamp"),
    (r'\bpalau\s*d[\'"]anglesola\b|\bpalau\s*anglesola\b', "Palau d'Anglesola"),
    (r'\bpoal\b', "El Poal"),
    (r'\bvila-sana\b', "Vila-sana"),

    # Garrigues
    (r'\bborges\s*blanques\b|\bborges\b|\bles\s*borges\b', "Les Borges Blanques"),
    (r'\barb[eè]ca\b|\barbeca\b', "Arbeca"),
    (r'\bl[\'"]albi\b|\balbi\b', "L'Albi"),
    (r'\bgranadella\b', "La Granadella"),
    (r'\bjuncosa\b', "Juncosa"),
    (r'\bla\s*pobla\s*de\s*c[eè]rvoles\b|\bcervoles\b', "La Pobla de Cérvoles"),
    (r'\bvinaixa\b', "Vinaixa"),

    # Conca de Barberà (límit)
    (r'\bmontblanc\b', "Montblanc"),

    # Referència genèrica
    (r'\bpeatge\b|\bpeaje\b', "A-2 (peatge)"),
    (r'\baeroport\b|\baeroporto\b|\baeroproto\b', "Aeroport de Lleida"),
]

ZONE_COORDS = {
    "N-II":                    (41.615, 0.620),
    "C-13":                    (41.850, 0.950),
    "C-14":                    (41.990, 1.030),
    "C-26":                    (41.790, 0.810),
    "C-12":                    (41.200, 0.600),
    "C-25":                    (41.900, 1.200),
    "C-28":                    (42.700, 0.800),
    "A-2":                     (41.580, 0.490),
    "N-260":                   (42.400, 1.200),
    "Lleida - Centre":         (41.614, 0.627),
    "Lleida - Cappont":        (41.610, 0.610),
    "Lleida - Balàfia":        (41.625, 0.635),
    "Lleida - La Bordeta":     (41.605, 0.615),
    "Lleida - La Magdalena":   (41.618, 0.632),
    "Lleida - Partida Alta":   (41.622, 0.638),
    "Lleida - El Corregidor":  (41.600, 0.608),
    "Mollerussa":              (41.625, 0.893),
    "Tàrrega":                 (41.645, 1.139),
    "Balaguer":                (41.791, 0.811),
    "La Seu d'Urgell":         (42.358, 1.457),
    "Tremp":                   (42.167, 0.900),
    "Cervera":                 (41.668, 1.272),
    "Les Borges Blanques":     (41.517, 0.866),
    "Ponts":                   (41.920, 1.195),
    "Artesa de Segre":         (41.899, 1.048),
    "Sort":                    (42.412, 1.128),
    "Vielha":                  (42.700, 0.795),
    "Pont de Suert":           (42.400, 0.745),
    "La Pobla de Segur":       (42.247, 0.972),
    "Isona":                   (42.050, 1.050),
    "Esterri d'Àneu":         (42.625, 1.140),
    "Rialp":                   (42.357, 1.110),
    "Alcarràs":                (41.569, 0.535),
    "Alguaire":                (41.771, 0.577),
    "Almacelles":              (41.718, 0.449),
    "Guissona":                (41.791, 1.305),
    "Bellpuig":                (41.619, 1.012),
    "Organyà":                 (42.218, 1.333),
    "Oliana":                  (42.072, 1.317),
    "Calaf":                   (41.727, 1.513),
    "Arbeca":                  (41.505, 1.034),
    "Rosselló":                (41.827, 0.698),
    "Torrefarrera":            (41.698, 0.637),
    "Torregrossa":             (41.590, 0.906),
    "Seròs":                   (41.459, 0.402),
    "Golmés":                  (41.656, 0.956),
    "Verdú":                   (41.616, 1.157),
    "Llavorsí":                (42.490, 1.215),
    "Camarasa":                (41.990, 0.877),
    "Menàrguens":              (41.860, 0.757),
    "Aeroport de Lleida":      (41.728, 0.535),
}


def normalize_text(text):
    text = text.lower()
    for orig, repl in [('à','a'),('á','a'),('è','e'),('é','e'),('í','i'),
                       ('ï','i'),('ò','o'),('ó','o'),('ú','u'),('ü','u'),
                       ('ç','c'),('ñ','n')]:
        text = text.replace(orig, repl)
    return text


def detect_pk(text_lower):
    """Detecta punt quilomètric en el missatge. Retorna string tipus 'km 45' o None."""
    match = PK_PATTERN.search(text_lower)
    if match:
        return match.group(0).strip()
    return None


def detect_patrol_type(text_lower):
    for ptype, keywords in PATROL_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                return ptype
    return "unknown"


def detect_zone(text_lower):
    for pattern, zone_norm in ZONE_PATTERNS:
        match = re.search(pattern, text_lower, re.IGNORECASE)
        if match:
            coords = ZONE_COORDS.get(zone_norm, (None, None))
            return match.group(0), zone_norm, coords[0], coords[1]
    return "", "Desconeguda", None, None


def calculate_confidence(text_lower, patrol_type, zone_norm):
    score = 0
    if patrol_type != "unknown": score += 2
    if zone_norm != "Desconeguda": score += 1
    strong = ["control", "radar", "patrulla", "cuidado", "compte", "alerta"]
    if any(kw in text_lower for kw in strong): score += 2
    if len(text_lower) > 30: score += 1
    if score >= 5: return "alta"
    elif score >= 3: return "mitja"
    else: return "baixa"


def extract_patrol_info(message, source="unknown"):
    if not message or len(message.strip()) < 5:
        return None

    text_lower = normalize_text(message)

    for neg in NEGATIVE_KEYWORDS:
        if neg in text_lower:
            return None

    has_presence = any(kw in text_lower for kw in PRESENCE_KEYWORDS)
    patrol_type = detect_patrol_type(text_lower)
    has_patrol_word = patrol_type != "unknown"

    if not has_presence and not has_patrol_word:
        return None

    if has_patrol_word and not has_presence:
        road_hints = ["km", "pk", "rotonda", "carretera", "carrer", "calle", "avinguda"]
        if not any(h in text_lower for h in road_hints):
            return None

    zone_literal, zone_norm, lat, lng = detect_zone(text_lower)
    pk = detect_pk(text_lower)
    confidence = calculate_confidence(text_lower, patrol_type, zone_norm)

    # Si tenim PK i carretera, afegim el PK a la zona
    zone_display = zone_literal or zone_norm
    if pk and zone_norm != "Desconeguda":
        zone_display = f"{zone_norm} ({pk})"

    return {
        "is_patrol": True,
        "patrol_type": patrol_type,
        "zone": zone_display,
        "zone_norm": zone_norm,
        "pk": pk,
        "confidence": confidence,
        "lat": lat,
        "lng": lng,
        "source": source,
    }


if __name__ == "__main__":
    tests = [
        "Mossos a la N-II km 456, cuidado",
        "Guardia civil en C-13 pasado Balaguer dirección norte",
        "Control policial a l'entrada de Mollerussa rotonda",
        "Radar mòbil a l'A2 pk 450",
        "Cuidado hay un control en Cervera a la C-25",
        "Mossos a Torrefarrera entrada",
        "Patrulla a Alcarràs rotonda del polígon",
        "GC a la N-II pk 120",
        "Control a Sort entrada nord",
        "Mossos a Artesa de Segre",
        "Radar a la C-14 km 23 passat Ponts",
        "Bon dia a tothom!",
        "Hay un accidente en la A2",
        "Ahir hi havia mossos a la N-II",
        "Policia local al carrer Major de Lleida fent controls",
        "Mossos a Vielha entrada del túnel",
        "Control a Guissona C-25",
        "GC a La Pobla de Segur C-13 pk 89",
    ]
    print("=" * 75)
    for msg in tests:
        r = extract_patrol_info(msg)
        if r:
            pk_str = f" PK:{r['pk']}" if r.get('pk') else ""
            print(f"✅ {r['patrol_type']:8} | {r['zone_norm']:30} |{pk_str:10} | {r['confidence']:5} | {msg[:45]}")
        else:
            print(f"⬜ {'—':8} | {'no rellevant':30} | {'—':5} | {msg[:45]}")
    print("=" * 75)
