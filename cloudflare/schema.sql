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

-- Seguiment dels controls avisats: serveix per mesurar quanta estona duren.
-- kind: echo (el mateix avís en un altre grup), still ("segueixen", "sí"),
--       cleared ("ja han marxat", "net", "no"), ask ("encara estan?").
CREATE TABLE IF NOT EXISTS patrol_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   TEXT NOT NULL,
    kind         TEXT NOT NULL,
    detection_id INTEGER,
    zone_norm    TEXT,
    source       TEXT,
    group_name   TEXT,
    raw_message  TEXT
);
CREATE INDEX IF NOT EXISTS idx_patrol_events_created ON patrol_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patrol_events_det ON patrol_events (detection_id);

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

-- Avisos de preu de carburant per SMS (pestanya Benzina).
-- last_price: últim preu comparat; target_hit: 1 si ja s'ha avisat d'estar per sota de l'objectiu.
CREATE TABLE IF NOT EXISTS fuel_alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phone           TEXT NOT NULL,
    station_id      TEXT NOT NULL,
    station_name    TEXT,
    fuel            TEXT NOT NULL,
    target          REAL,
    last_price      REAL,
    target_hit      INTEGER NOT NULL DEFAULT 0,
    last_sent_at    TEXT,
    last_sent_price REAL,
    created_at      TEXT NOT NULL,
    UNIQUE (phone, station_id, fuel)
);

-- Registre d'SMS enviats per avís (límit diari i traçabilitat).
CREATE TABLE IF NOT EXISTS fuel_sms_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL,
    sent_at  TEXT NOT NULL,
    price    REAL
);
CREATE INDEX IF NOT EXISTS idx_fuel_sms_alert ON fuel_sms_log (alert_id, sent_at);

-- Grups de WhatsApp i Telegram que alimenten l'app, gestionables des de Config.
-- status: 'active' (es desen els avisos), 'pending' (nou, esperant que algú l'activi),
--         'off' (ignorat). Els grups de WhatsApp nous entren com a 'pending';
--         els de Telegram com a 'active' (afegir-hi el bot ja és una decisió explícita).
CREATE TABLE IF NOT EXISTS group_settings (
    source     TEXT NOT NULL,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',
    added_by   TEXT,
    first_seen TEXT,
    last_seen  TEXT,
    hits       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source, name)
);

CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Només la primera vegada: els grups que ja enviaven avisos queden actius,
-- perquè el canvi no talli res del que ja funcionava.
INSERT OR IGNORE INTO group_settings (source, name, status, first_seen, last_seen, hits)
SELECT source, group_name, 'active', MIN(created_at), MAX(created_at), COUNT(*)
FROM detections
WHERE source IN ('whatsapp', 'telegram') AND group_name IS NOT NULL AND TRIM(group_name) != ''
  AND group_name NOT IN ('WhatsApp', 'Telegram', 'Report manual')
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'groups_seeded')
GROUP BY source, group_name;

INSERT OR IGNORE INTO group_settings (source, name, status, first_seen, last_seen, hits)
SELECT source, group_name, 'active', MIN(received_at), MAX(received_at), COUNT(*)
FROM ingest_hits
WHERE source IN ('whatsapp', 'telegram') AND group_name IS NOT NULL AND TRIM(group_name) != ''
  AND group_name NOT IN ('WhatsApp', 'Telegram', 'Report manual')
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'groups_seeded')
GROUP BY source, group_name;

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('groups_seeded', datetime('now'));

-- Accessos per persona: cada amic té el seu token (es desa només el hash SHA-256)
-- i un codi públic per vincular-hi els grups de Telegram on afegeix el bot.
-- El token d'administració (INGEST_TOKEN) correspon a l'usuari 'admin'.
CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    code       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_seen  TEXT,
    revoked    INTEGER NOT NULL DEFAULT 0
);

-- Grups per persona (substitueix group_settings, que queda sense ús).
CREATE TABLE IF NOT EXISTS user_groups (
    owner      TEXT NOT NULL,
    source     TEXT NOT NULL,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',
    added_by   TEXT,
    first_seen TEXT,
    last_seen  TEXT,
    hits       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner, source, name)
);

-- Quin usuari ha afegit el bot a cada xat de Telegram (enllaç startgroup=<codi>).
CREATE TABLE IF NOT EXISTS telegram_chat_owner (
    chat_id     TEXT PRIMARY KEY,
    owner       TEXT NOT NULL,
    assigned_at TEXT NOT NULL
);

-- Només la primera vegada: els grups configurats fins ara passen a ser de l'admin.
INSERT OR IGNORE INTO user_groups (owner, source, name, status, added_by, first_seen, last_seen, hits)
SELECT 'admin', source, name, status, added_by, first_seen, last_seen, hits
FROM group_settings
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'user_groups_migrated');

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('user_groups_migrated', datetime('now'));
