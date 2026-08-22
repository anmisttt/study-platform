-- ch8_team_admins.sql
-- Lab: multi-row "at least one admin" invariant (DDIA ch8)

DROP MATERIALIZED VIEW IF EXISTS teams_without_admins;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP FUNCTION IF EXISTS check_team_admin_coverage();

CREATE TABLE teams (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE team_members (
  user_id INT  NOT NULL,
  team_id INT  REFERENCES teams(id),
  role    TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  PRIMARY KEY (user_id, team_id)
);

INSERT INTO teams VALUES (1, 'Engineering');
INSERT INTO team_members VALUES
  (10, 1, 'admin'),
  (11, 1, 'admin'),
  (12, 1, 'member');

-- Task 1: attempt a CHECK that enforces "at least one admin per team"
-- (expect PostgreSQL to reject this — document why)
-- ALTER TABLE team_members ADD CONSTRAINT at_least_one_admin CHECK (
--   /* subquery / cross-row CHECK — fill in and observe the error */
-- );

-- Task 2–3: last-admin guard on UPDATE and DELETE
CREATE OR REPLACE FUNCTION check_team_admin_coverage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- implement last-admin guard on UPDATE (block downgrade when no other admin)
  -- implement last-admin guard on DELETE (block delete when no other admin)
  -- use TG_OP to distinguish UPDATE vs DELETE; RAISE EXCEPTION on violation
  RAISE EXCEPTION 'not implemented';
END;
$$;

CREATE TRIGGER team_admin_coverage_check
BEFORE UPDATE OR DELETE ON team_members
FOR EACH ROW EXECUTE FUNCTION check_team_admin_coverage();

-- Task 4: audit view — teams with no admin
-- CREATE MATERIALIZED VIEW teams_without_admins AS
--   SELECT ... -- teams with no admin (team_id, name)
-- ;
