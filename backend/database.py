import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "patroltrack.db"

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS detections (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at  TEXT NOT NULL,
            hour        INTEGER NOT NULL,
            day_of_week INTEGER NOT NULL,
            zone        TEXT NOT NULL,
            zone_norm   TEXT NOT NULL,
            patrol_type TEXT NOT NULL,
            source      TEXT NOT NULL,
            group_name  TEXT,
            raw_message TEXT,
            confidence  TEXT DEFAULT 'mitja',
            lat         REAL,
            lng         REAL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_zone_hour ON detections (zone_norm, hour)")
    conn.commit()
    conn.close()
    print("DB inicialitzada")

def insert_detection(data):
    now = datetime.now()
    conn = get_conn()
    cursor = conn.execute("""
        INSERT INTO detections
            (created_at, hour, day_of_week, zone, zone_norm,
             patrol_type, source, group_name, raw_message, confidence, lat, lng)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    """, (now.isoformat(), now.hour, now.weekday(),
        data.get("zone",""), data.get("zone_norm",""),
        data.get("patrol_type","mossos"), data.get("source","unknown"),
        data.get("group_name",""), data.get("raw_message",""),
        data.get("confidence","mitja"), data.get("lat"), data.get("lng")))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id

def get_detections_for_probability(zone_norm, hour):
    hours = [(hour-1)%24, hour, (hour+1)%24]
    placeholders = ",".join("?"*len(hours))
    conn = get_conn()
    rows = conn.execute(f"""
        SELECT patrol_type, confidence, created_at FROM detections
        WHERE zone_norm = ? AND hour IN ({placeholders})
        ORDER BY created_at DESC LIMIT 500
    """, [zone_norm]+hours).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_recent_detections(limit=20):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM detections ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_db_stats():
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
    cutoff = (datetime.now()-timedelta(hours=24)).isoformat()
    last_24h = conn.execute("SELECT COUNT(*) FROM detections WHERE created_at > ?", (cutoff,)).fetchone()[0]
    conn.close()
    return {"total": total, "last_24h": last_24h}
