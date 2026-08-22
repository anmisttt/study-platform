-- setup.sql — messages table with seed data; indexes are stubs (implement at comment sites)
DROP TABLE IF EXISTS messages CASCADE;

CREATE TABLE messages (
  id          BIGSERIAL    PRIMARY KEY,
  channel_id  BIGINT       NOT NULL,
  author_id   BIGINT       NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  body        TEXT         NOT NULL,
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ
);

-- Seed enough rows for EXPLAIN to prefer indexes: 3 channels, mixed authors, some soft-deletes.
-- One rare phrase (~0.1% of rows) keeps Q3 selective so the planner can use the GIN index.
INSERT INTO messages (channel_id, author_id, created_at, body, deleted_at)
SELECT
  1 + (g % 3),
  100 + (g % 10),
  TIMESTAMPTZ '2024-01-01' + ((g % 5000) || ' minutes')::interval,
  CASE
    WHEN g % 1000 = 0 THEN 'xenon quarantine protocol ticket ' || g
    WHEN g % 5 = 1 THEN 'please reset my password soon'
    WHEN g % 5 = 2 THEN 'meeting notes and follow-ups'
    WHEN g % 5 = 3 THEN 'deploy rolled back after timeout'
    WHEN g % 5 = 4 THEN 'hello from channel chat ' || g
    ELSE 'shipping delay for order ' || g
  END,
  CASE WHEN g % 17 = 0 THEN TIMESTAMPTZ '2024-06-01' ELSE NULL END
FROM generate_series(1, 100000) AS g;

ANALYZE messages;

-- Index section: leave empty until Tasks step 2.
-- implement Q1 covering/partial index
--   CREATE INDEX ... ON messages (channel_id, created_at DESC)
--   INCLUDE (id, author_id, body) WHERE deleted_at IS NULL;

-- implement Q2 composite
--   CREATE INDEX ... ON messages (channel_id, author_id, created_at DESC)
--   WHERE deleted_at IS NULL;

-- implement Q3 GIN tsvector
--   CREATE INDEX ... ON messages USING GIN (to_tsvector('english', body))
--   WHERE deleted_at IS NULL;
