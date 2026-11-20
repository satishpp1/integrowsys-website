CREATE TABLE IF NOT EXISTS lead_notes (
    id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id
    ON lead_notes(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at
    ON lead_notes(created_at);