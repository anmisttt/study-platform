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
