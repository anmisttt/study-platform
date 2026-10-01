CREATE TABLE media_assets (id integer PRIMARY KEY, title text NOT NULL);
INSERT INTO media_assets VALUES (1, 'Forest walk'), (2, 'City lights'), (3, 'Ocean morning');
CREATE TABLE export_jobs (
    export_id text PRIMARY KEY,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'done')),
    artifact_path text
);
CREATE TABLE publications (
    export_id text PRIMARY KEY REFERENCES export_jobs,
    mode text NOT NULL CHECK (mode IN ('scheduled', 'immediate')),
    published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
