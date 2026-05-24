"""
Extractor de patrulles GRATUÏT — sense API
Usa paraules clau i expressions regulars per detectar patrulles

No necessita cap clau d'API ni connexió externa.
"""

import re

# ── Paraules clau de patrulles ─────────────────────────────────────────────

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
]

NEGATIVE_KEYWORDS = [
    "ahir", "ayer", "fa dies", "hace días",
    "la setmana passada", "la semana pasada",
    "ja han marxat", "ya se han ido", "ja no hi són",
    "notícia", "noticia", "diari", "diario",
    "broma", "conya", "fake",
]

# ── Zones de Lleida ────────────────────────────────────────────────────────

ZONE_PATTERNS = [
    (r'\bN-?II\b|\bnacional\s*2\b|\bnacional\s*ii\b', "N-II (Lleida centre)"),
    (r'\bC-?13\b', "C-13 (cap al nord)"),
    (r'\bC-?14\b', "C-14 (Ponts/Balaguer)"),
    (r'\bC-?26\b', "C-26 (Balaguer)"),
    (r'\bA-?2\b|\bautopista\b', "A-2 (autopista)"),
    (r'\bC-?25\b', "C-25 (Eix Transversal)"),
    (r'\bcappont\b', "Lleida ciutat - Cappont"),
    (r'\bbal[aà]fia\b|\bbalafia\b', "Lleida ciutat - Balàfia"),
    (r'\bcarrer\s*major\b|\brambla\b', "Lleida ciutat - Centre"),
    (r'\blleida\b', "Lleida ciutat - Centre"),
    (r'\bmollerussa\b', "Mollerussa"),
    (r'\bt[aà]rrega\b|\btarrega\b', "Tàrrega"),
    (r'\bbalaguer\b', "Balaguer"),
    (r'\bla\s*seu\b|\bseu\s*d[\'"]urgell\b', "La Seu d'Urgell"),
    (r'\btremp\b', "Tremp"),
    (r'\bcervera\b', "Cervera"),
    (r'\bborges\s*blanques\b|\bborges\b', "Les Borges Blanques"),
    (r'\bpons\b|\bponts\b', "C-14 (Ponts/Balaguer)"),
    (r'\bsort\b', "C-13 (cap al nord)"),
    (r'\bvielha\b|\bviella\b', "C-28 (Val d'Aran)"),
    (r'\bpeatge\b|\bpeaje\b', "A-2 (autopista)"),
]

ZONE_COORDS = {
    "N-II (Lleida centre)":      (41.615, 0.620),
    "C-13 (cap al nord)":        (41.850, 0.950),
    "C-14 (Ponts/Balaguer)":     (41.990, 1.030),
    "C-26 (Balaguer)":           (41.790, 0.810),
    "A-2 (autopista)":           (41.580, 0.490),
    "Lleida ciutat - Centre":    (41.614, 0.627),
    "Lleida ciutat - Cappont":   (41.610, 0.610),
    "Lleida ciutat - Balàfia":   (41.625, 0.635),
    "Mollerussa":                (41.625, 0.893),
    "Tàrrega":                   (41.645, 1.139),
    "Balaguer":                  (41.791, 0.811),
    "La Seu d'Urgell":           (42.358, 1.457),
    "Tremp":                     (42.167, 0.900),
    "Cervera":                   (41.668, 1.272),
    "Les Borges Blanques":       (41.517, 0.866),
    "C-28 (Val d'Aran)":         (42.700, 0.800),
    "C-25 (Eix Transversal)":    (41.900, 1.200),
}


def normalize_text(text):
    text = text.lower()
    for orig, repl in [('à','a'),('á','a'),('è','e'),('é','e'),('í','i'),
                       ('ï','i'),('ò','o'),('ó','o'),('ú','u'),('ü','u'),
                       ('ç','c'),('ñ','n')]:
        text = text.replace(orig, repl)
    return text


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
    """
    Funció principal. Retorna dict amb info de patrulla o None.
    Compatible amb la interfície de l'extractor original.
    """
    if not message or len(message.strip()) < 5:
        return None

    text_lower = normalize_text(message)

    # Descarta missatges negatius
    for neg in NEGATIVE_KEYWORDS:
        if neg in text_lower:
            return None

    has_presence = any(kw in text_lower for kw in PRESENCE_KEYWORDS)
    patrol_type = detect_patrol_type(text_lower)
    has_patrol_word = patrol_type != "unknown"

    if not has_presence and not has_patrol_word:
        return None

    # Paraula de patrulla sense presència: comprova hints de carretera
    if has_patrol_word and not has_presence:
        road_hints = ["km", "rotonda", "carretera", "carrer", "avinguda", "calle"]
        if not any(h in text_lower for h in road_hints):
            return None

    zone_literal, zone_norm, lat, lng = detect_zone(text_lower)
    confidence = calculate_confidence(text_lower, patrol_type, zone_norm)

    return {
        "is_patrol": True,
        "patrol_type": patrol_type,
        "zone": zone_literal or zone_norm,
        "zone_norm": zone_norm,
        "confidence": confidence,
        "lat": lat,
        "lng": lng,
        "source": source,
    }


# ── Test ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    tests = [
        "Mossos a la N-II a l'altura del km 456, cuidado",
        "Guardia civil en C-13 pasado Balaguer dirección norte",
        "Control policial a l'entrada de Mollerussa rotonda",
        "Radar mòbil a l'A2 km 450",
        "Cuidado hay un control en la rotonda del Lidl de Lleida",
        "Bon dia a tothom!",
        "Hay un accidente en la A2",
        "Ahir hi havia mossos a la N-II",
        "Policia local al carrer Major fent controls",
        "GC a la C-14 a Ponts",
        "Atenció, patrulla mossos a Balaguer entrada nord",
        "Com va la festa?",
    ]
    print("=" * 70)
    for msg in tests:
        r = extract_patrol_info(msg)
        if r:
            print(f"✅ {r['patrol_type']:8} | {r['zone_norm']:30} | {r['confidence']:5} | {msg[:45]}")
        else:
            print(f"⬜ {'—':8} | {'no rellevant':30} | {'—':5} | {msg[:45]}")
    print("=" * 70)
