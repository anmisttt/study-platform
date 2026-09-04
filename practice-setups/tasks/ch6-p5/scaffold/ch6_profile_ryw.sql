-- ch6_profile_ryw.sql
-- Lab: async replica lag + read-your-writes routing for profiles (DDIA ch6)
DROP TABLE IF EXISTS ch6_last_write CASCADE;
DROP TABLE IF EXISTS ch6_profiles_replica CASCADE;
DROP TABLE IF EXISTS ch6_profiles CASCADE;
DROP FUNCTION IF EXISTS ch6_refresh_replica();
DROP FUNCTION IF EXISTS ch6_write_profile(BIGINT, TEXT);
DROP FUNCTION IF EXISTS ch6_read_profile(BIGINT);
DROP FUNCTION IF EXISTS ch6_wait_replica_lsn(pg_lsn, INTERVAL);

CREATE TABLE ch6_profiles (
  user_id       BIGINT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT ''
);

-- Stale snapshot standing in for an async physical replica
CREATE TABLE ch6_profiles_replica (LIKE ch6_profiles INCLUDING ALL);

-- Per-user last-write gate for read-your-writes (app metadata; Redis in production)
CREATE TABLE ch6_last_write (
  user_id    BIGINT PRIMARY KEY,
  written_at TIMESTAMPTZ NOT NULL,
  write_lsn  pg_lsn
);

INSERT INTO ch6_profiles (user_id, display_name, bio) VALUES
  (101, 'Alice', 'Engineer'),
  (202, 'Bob',   'Designer');

INSERT INTO ch6_profiles_replica SELECT * FROM ch6_profiles;

-- Already working: simulate replica catch-up
CREATE OR REPLACE FUNCTION ch6_refresh_replica()
RETURNS void
LANGUAGE sql AS $$
  TRUNCATE ch6_profiles_replica;
  INSERT INTO ch6_profiles_replica SELECT * FROM ch6_profiles;
$$;

CREATE OR REPLACE FUNCTION ch6_write_profile(p_user_id BIGINT, p_bio TEXT)
RETURNS TABLE(user_id BIGINT, bio TEXT, written_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
BEGIN
  -- implement: UPDATE ch6_profiles bio; upsert ch6_last_write
  --   (written_at = now(), write_lsn = pg_current_wal_lsn()); return the row
  RAISE EXCEPTION 'not implemented';
END;
$$;

CREATE OR REPLACE FUNCTION ch6_read_profile(p_user_id BIGINT)
RETURNS TABLE(src TEXT, user_id BIGINT, bio TEXT)
LANGUAGE plpgsql AS $$
BEGIN
  -- implement read-your-writes routing:
  --   if this user has ch6_last_write.written_at within the last 60 seconds
  --   → SELECT from ch6_profiles (primary), src = 'primary'
  --   else → SELECT from ch6_profiles_replica, src = 'replica'
  -- optional implement: call ch6_wait_replica_lsn(write_lsn) before replica read
  RAISE EXCEPTION 'not implemented';
END;
$$;

-- Optional LSN-wait stub (not required for Tasks 1–2; discuss in Task 3)
CREATE OR REPLACE FUNCTION ch6_wait_replica_lsn(
  p_write_lsn pg_lsn,
  p_timeout INTERVAL DEFAULT interval '2 seconds'
) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  -- implement (optional): in a real cluster, poll pg_stat_replication.replay_lsn
  --   until replay_lsn >= p_write_lsn or timeout; return true if caught up
  -- This lab's stale-snapshot model has no WAL receiver — leave as stub or
  --   return false and let ch6_read_profile fall back to primary via the 60s gate
  RAISE EXCEPTION 'not implemented';
END;
$$;
