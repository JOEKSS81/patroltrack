-- PatrolTrack D1 schema
-- Compatible amb el SQLite local; created_at en UTC ISO 8601.
-- hour i day_of_week en zona horària Europe/Madrid.
-- day_of_week: 0 = Diumenge (compatible amb JavaScript getDay()).

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
);

CREATE INDEX IF NOT EXISTS idx_zone_hour    ON detections (zone_norm, hour);
CREATE INDEX IF NOT EXISTS idx_created_at   ON detections (created_at DESC);
