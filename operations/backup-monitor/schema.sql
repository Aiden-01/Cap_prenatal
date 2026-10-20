PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
 run_id TEXT PRIMARY KEY, slot TEXT NOT NULL, observed_at REAL NOT NULL,
 event_type TEXT NOT NULL, verified INTEGER NOT NULL, event_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS incidents (
 incident_id TEXT PRIMARY KEY, opened_at REAL NOT NULL, closed_at REAL,
 cause TEXT NOT NULL, recovery_run TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident ON incidents((1)) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS outbox (
 event_id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
 kind TEXT NOT NULL CHECK(kind IN ('ALERTA','RECUPERADO')), payload TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','claimed','confirmed','uncertain')),
 created_at REAL NOT NULL, due_at REAL NOT NULL, first_attempt REAL,
 claim_id TEXT, lease_until REAL, attempts INTEGER NOT NULL DEFAULT 0,
 provider_id TEXT, manual_review INTEGER NOT NULL DEFAULT 0,
 UNIQUE(incident_id,kind)
);
