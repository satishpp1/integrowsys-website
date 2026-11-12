CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

    name TEXT NOT NULL,
    company TEXT,
    designation TEXT,
    email TEXT,
    phone TEXT NOT NULL,

    city TEXT,
    facility_type TEXT,
    service_interest TEXT NOT NULL,
    message TEXT NOT NULL,

    consent INTEGER NOT NULL DEFAULT 0
        CHECK (consent IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'new'
        CHECK (
            status IN (
                'new',
                'contacted',
                'qualified',
                'proposal',
                'won',
                'lost',
                'spam'
            )
        ),

    source_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
    ON leads(created_at);

CREATE INDEX IF NOT EXISTS idx_leads_status
    ON leads(status);

CREATE INDEX IF NOT EXISTS idx_leads_phone
    ON leads(phone);

CREATE INDEX IF NOT EXISTS idx_leads_email
    ON leads(email);
