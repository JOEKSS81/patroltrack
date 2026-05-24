from database import get_detections_for_probability
from datetime import datetime

CONFIDENCE_WEIGHTS = {"alta":1.0,"mitja":0.6,"baixa":0.3}

def time_decay(created_at):
    try:
        days_old = (datetime.now()-datetime.fromisoformat(created_at)).days
        if days_old<=7: return 1.0
        elif days_old<=30: return 0.7
        elif days_old<=90: return 0.4
        else: return 0.2
    except: return 0.5

def get_probability(zone_norm, hour):
    records = get_detections_for_probability(zone_norm, hour)
    if not records:
        return {"mossos":0.0,"guardia":0.0,"local":0.0,"overall":0.0,"sample_size":0,"reliability":"cap dada"}
    scores = {"mossos":0.0,"guardia":0.0,"local":0.0}
    counts = {"mossos":0,"guardia":0,"local":0}
    for r in records:
        ptype = r["patrol_type"]
        if ptype not in scores: continue
        scores[ptype] += CONFIDENCE_WEIGHTS.get(r["confidence"],0.5) * time_decay(r["created_at"])
        counts[ptype] += 1
    result = {}
    for ptype in ["mossos","guardia","local"]:
        result[ptype] = round(min(scores[ptype]/28,1.0),3) if counts[ptype]>0 else 0.0
    result["overall"] = round(max(result["mossos"],result["guardia"],result["local"]),3)
    n = len(records)
    result["sample_size"] = n
    result["reliability"] = "alta" if n>=20 else "mitja" if n>=5 else "baixa"
    return result

def get_heatmap_data():
    from database import get_conn
    conn = get_conn()
    zones = conn.execute("SELECT DISTINCT zone_norm FROM detections").fetchall()
    conn.close()
    hour = datetime.now().hour
    return sorted([{"zone":r["zone_norm"],"hour":hour,**get_probability(r["zone_norm"],hour)} for r in zones], key=lambda x:x["overall"],reverse=True)
