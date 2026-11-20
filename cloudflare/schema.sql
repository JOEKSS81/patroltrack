-- PatrolTrack D1 schema
-- created_at en UTC ISO 8601; hour/day_of_week en zona Europe/Madrid.

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

CREATE INDEX IF NOT EXISTS idx_zone_hour ON detections (zone_norm, hour);
CREATE INDEX IF NOT EXISTS idx_created_at ON detections (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_source ON detections (group_name, source);

-- Diagnostic log for Telegram webhook requests.
CREATE TABLE IF NOT EXISTS telegram_hits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at  TEXT NOT NULL,
    outcome      TEXT NOT NULL,
    reason       TEXT,
    chat_id      TEXT,
    chat_title   TEXT,
    text_preview TEXT
);
CREATE INDEX IF NOT EXISTS idx_tg_hits_received ON telegram_hits (received_at DESC);

-- Telegram retries an update when a webhook response is not acknowledged.
-- A unique update_id ensures a retry cannot create a duplicate detection.
CREATE TABLE IF NOT EXISTS telegram_updates (
    update_id INTEGER PRIMARY KEY,
    claim     TEXT NOT NULL
);

-- Diagnostic log for /api/ingest (MacroDroid, Tasker, report manual): permet
-- comprovar que el mòbil arriba al servidor encara que el missatge es descarti.
CREATE TABLE IF NOT EXISTS ingest_hits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at  TEXT NOT NULL,
    outcome      TEXT NOT NULL,
    source       TEXT,
    group_name   TEXT,
    text_preview TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_hits_received ON ingest_hits (received_at DESC);
