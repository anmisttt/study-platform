\set ON_ERROR_STOP on

DO $verify$
DECLARE
  plan json;
  actual_average numeric;
  expected_average numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    JOIN pg_class AS index_class ON index_class.oid = index_info.indexrelid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_info.indrelid = 'batch.activity_events'::regclass
      AND access_method.amname = 'btree'
      AND strpos(pg_get_indexdef(index_info.indexrelid), '(user_id, ts)') > 0
  ) THEN
    RAISE EXCEPTION 'activity_events needs an index beginning with (user_id, ts)';
  END IF;

  PERFORM set_config('enable_hashjoin', 'off', true);
  PERFORM set_config('enable_nestloop', 'off', true);
  EXECUTE $plan$
    EXPLAIN (FORMAT JSON, COSTS OFF)
    SELECT e.url, u.dob_year, e.ts
    FROM batch.activity_events AS e
    JOIN batch.users AS u ON u.user_id = e.user_id
    ORDER BY e.user_id, e.ts
  $plan$ INTO plan;

  IF plan::text NOT LIKE '%"Node Type": "Merge Join"%' THEN
    RAISE EXCEPTION 'the forced plan does not contain a Merge Join';
  END IF;

  IF to_regclass('batch.events_with_dob') IS NULL THEN
    RAISE EXCEPTION 'batch.events_with_dob does not exist';
  END IF;

  IF (
    SELECT array_agg(column_name::text ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'batch'
      AND table_name = 'events_with_dob'
  ) IS DISTINCT FROM ARRAY['url', 'dob_year', 'ts']::text[] THEN
    RAISE EXCEPTION 'batch.events_with_dob has unexpected columns';
  END IF;

  IF EXISTS (
    (SELECT e.url, u.dob_year, e.ts
     FROM batch.activity_events AS e
     JOIN batch.users AS u ON u.user_id = e.user_id)
    EXCEPT ALL
    (SELECT url, dob_year, ts FROM batch.events_with_dob)
  ) OR EXISTS (
    (SELECT url, dob_year, ts FROM batch.events_with_dob)
    EXCEPT ALL
    (SELECT e.url, u.dob_year, e.ts
     FROM batch.activity_events AS e
     JOIN batch.users AS u ON u.user_id = e.user_id)
  ) THEN
    RAISE EXCEPTION 'batch.events_with_dob does not match the source join';
  END IF;

  SELECT avg(2024 - dob_year)
  INTO actual_average
  FROM batch.events_with_dob
  WHERE url = '/p/1';

  SELECT avg(2024 - u.dob_year)
  INTO expected_average
  FROM batch.activity_events AS e
  JOIN batch.users AS u ON u.user_id = e.user_id
  WHERE e.url = '/p/1';

  IF actual_average IS DISTINCT FROM expected_average OR actual_average IS NULL THEN
    RAISE EXCEPTION 'the /p/1 average viewer age is incorrect';
  END IF;
END
$verify$;

SELECT 'verification passed' AS result;
