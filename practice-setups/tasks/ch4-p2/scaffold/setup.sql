-- setup.sql — users table with a wrongly ordered composite index
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id           BIGSERIAL    PRIMARY KEY,
  email        TEXT         UNIQUE NOT NULL,
  country      TEXT         NOT NULL,
  signup_date  DATE         NOT NULL,
  last_login   TIMESTAMPTZ
);

-- Seed 50k rows: 5 countries, dates across 2023–2024 (deterministic).
INSERT INTO users (email, country, signup_date, last_login)
SELECT
  'user' || g || '@example.com',
  (ARRAY['US', 'DE', 'FR', 'GB', 'IN'])[1 + (g % 5)],
  DATE '2023-01-01' + ((g % 730) || ' days')::interval,
  TIMESTAMPTZ '2024-06-01' + ((g % 100) || ' hours')::interval
FROM generate_series(1, 50000) AS g;

-- Wrong column order for the hot query (equality on country, range on signup_date).
-- fix: equality column first, then range/sort; consider INCLUDE for covering
CREATE INDEX users_signup_country_idx ON users (signup_date, country);

ANALYZE users;
