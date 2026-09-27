\set ON_ERROR_STOP on

BEGIN;

UPDATE page_views
SET view_count = 0, version = 0
WHERE page_id = 'home';

DO $$
DECLARE
  first_count BIGINT;
  second_count BIGINT;
  first_cas BOOLEAN;
  stale_cas BOOLEAN;
BEGIN
  SELECT atomic_increment('home') INTO first_count;
  SELECT atomic_increment('home') INTO second_count;

  IF first_count <> 1 OR second_count <> 2 THEN
    RAISE EXCEPTION 'atomic increment returned unexpected counts: %, %',
      first_count, second_count;
  END IF;

  UPDATE page_views
  SET view_count = 5, version = 3
  WHERE page_id = 'home';

  SELECT compare_and_set('home', 3, 6) INTO first_cas;
  SELECT compare_and_set('home', 3, 7) INTO stale_cas;

  IF first_cas IS DISTINCT FROM true
     OR stale_cas IS DISTINCT FROM false
     OR (SELECT view_count FROM page_views WHERE page_id = 'home') <> 6
     OR (SELECT version FROM page_views WHERE page_id = 'home') <> 4 THEN
    RAISE EXCEPTION 'compare-and-set produced an unexpected outcome';
  END IF;
END
$$;

ROLLBACK;
\echo 'verification passed'
