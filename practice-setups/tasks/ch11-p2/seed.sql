-- setup.sql — events × users for a sort-merge join lab
DROP SCHEMA IF EXISTS batch CASCADE;

CREATE SCHEMA batch;

CREATE TABLE batch.users (
  user_id   BIGINT PRIMARY KEY,
  dob_year  INT NOT NULL,
  country   TEXT NOT NULL
);

CREATE TABLE batch.activity_events (
  event_id  BIGSERIAL PRIMARY KEY,
  user_id   BIGINT NOT NULL REFERENCES batch.users (user_id),
  url       TEXT NOT NULL,
  ts        TIMESTAMPTZ NOT NULL
);

INSERT INTO batch.users (user_id, dob_year, country)
SELECT
  g,
  1970 + (g % 40),
  (ARRAY['US', 'DE', 'IN', 'BR', 'GB'])[1 + (g % 5)]
FROM generate_series(1, 1000) AS g;

INSERT INTO batch.activity_events (user_id, url, ts)
SELECT
  1 + (random() * 999)::int,
  '/p/' || (1 + (random() * 49)::int),
  TIMESTAMPTZ '2024-01-01' + (g || ' minutes')::interval
FROM generate_series(1, 20000) AS g;

-- Index so both sides can be scanned in user_id order (merge join friendly).
-- implement: CREATE INDEX ... ON batch.activity_events (user_id, ts);
-- (users already ordered by its PRIMARY KEY on user_id)

ANALYZE batch.users;

ANALYZE batch.activity_events;
