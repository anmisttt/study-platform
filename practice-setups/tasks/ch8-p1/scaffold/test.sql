\set ON_ERROR_STOP on

BEGIN;

INSERT INTO teams (id, name) VALUES (3, 'Temporary');

INSERT INTO team_members (user_id, team_id, role)
VALUES (30, 3, 'admin');

DO $$
DECLARE
  move_blocked boolean := false;
  null_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE team_members
    SET team_id = 1
    WHERE team_id = 3 AND user_id = 30;
  EXCEPTION WHEN OTHERS THEN
    move_blocked := true;
  END;

  IF NOT move_blocked
     OR NOT EXISTS (
       SELECT 1 FROM team_members
       WHERE team_id = 3 AND user_id = 30 AND role = 'admin'
     ) THEN
    RAISE EXCEPTION 'last-admin team reassignment was not blocked';
  END IF;

  BEGIN
    UPDATE team_members
    SET team_id = NULL
    WHERE team_id = 3 AND user_id = 30;
  EXCEPTION WHEN OTHERS THEN
    null_blocked := true;
  END;

  IF NOT null_blocked
     OR NOT EXISTS (
       SELECT 1 FROM team_members
       WHERE team_id = 3 AND user_id = 30 AND role = 'admin'
     ) THEN
    RAISE EXCEPTION 'last-admin team nulling was not blocked';
  END IF;
END
$$;

DO $$
DECLARE
  update_covered boolean;
  delete_covered boolean;
BEGIN
  SELECT
    bool_or((tgtype & 16) = 16),
    bool_or((tgtype & 8) = 8)
  INTO update_covered, delete_covered
  FROM pg_trigger
  WHERE tgrelid = 'team_members'::regclass
    AND NOT tgisinternal
    AND tgenabled <> 'D'
    AND (tgtype & 1) = 1;

  IF NOT coalesce(update_covered, false)
     OR NOT coalesce(delete_covered, false) THEN
    RAISE EXCEPTION 'enabled row triggers must cover UPDATE and DELETE';
  END IF;
END
$$;

UPDATE team_members
SET role = 'member'
WHERE team_id = 1 AND user_id = 10;

DO $$
DECLARE
  update_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE team_members
    SET role = 'member'
    WHERE team_id = 1 AND user_id = 11;
  EXCEPTION WHEN OTHERS THEN
    update_blocked := true;
  END;

  IF NOT update_blocked
     OR (SELECT role FROM team_members WHERE team_id = 1 AND user_id = 11) <> 'admin' THEN
    RAISE EXCEPTION 'last-admin UPDATE was not blocked';
  END IF;
END
$$;

UPDATE team_members
SET role = 'admin'
WHERE team_id = 1 AND user_id = 10;

DELETE FROM team_members
WHERE team_id = 1 AND user_id = 10;

DO $$
DECLARE
  delete_blocked boolean := false;
BEGIN
  BEGIN
    DELETE FROM team_members
    WHERE team_id = 1 AND user_id = 11;
  EXCEPTION WHEN OTHERS THEN
    delete_blocked := true;
  END;

  IF NOT delete_blocked
     OR NOT EXISTS (
       SELECT 1 FROM team_members
       WHERE team_id = 1 AND user_id = 11 AND role = 'admin'
     ) THEN
    RAISE EXCEPTION 'last-admin DELETE was not blocked';
  END IF;
END
$$;

INSERT INTO teams (id, name) VALUES
  (2, 'Support'),
  (4, 'Design');

INSERT INTO team_members (user_id, team_id, role)
VALUES (20, 4, 'member');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM teams_without_admins WHERE team_id IN (2, 4)) THEN
    RAISE EXCEPTION 'materialized view changed before refresh';
  END IF;
END
$$;

REFRESH MATERIALIZED VIEW teams_without_admins;

DO $$
BEGIN
  IF (SELECT count(*) FROM teams_without_admins WHERE team_id = 1) <> 0
     OR (SELECT name FROM teams_without_admins WHERE team_id = 2) IS DISTINCT FROM 'Support'
     OR (SELECT name FROM teams_without_admins WHERE team_id = 4) IS DISTINCT FROM 'Design' THEN
    RAISE EXCEPTION 'teams_without_admins returned unexpected rows';
  END IF;
END
$$;

ROLLBACK;
\echo 'verification passed'
