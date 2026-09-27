\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE ch5_batch_result ON COMMIT DROP AS
SELECT ch5_backfill_normalized_names(3) AS updated_rows;

DO $$
DECLARE
  v_updated_rows integer;
  v_changed_ids bigint[];
BEGIN
  SELECT updated_rows INTO v_updated_rows
  FROM ch5_batch_result;

  IF v_updated_rows <> 3 THEN
    RAISE EXCEPTION 'small batch returned %, expected 3', v_updated_rows;
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_changed_ids
  FROM ch5_projects
  WHERE id <= 20000
    AND normalized_name IS NOT NULL;

  IF v_changed_ids IS DISTINCT FROM ARRAY[1, 2, 3]::bigint[] THEN
    RAISE EXCEPTION 'small batch changed unexpected rows: %', v_changed_ids;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ch5_projects
    WHERE id BETWEEN 1 AND 3
      AND normalized_name IS DISTINCT FROM ch5_normalize_name(name)
  ) THEN
    RAISE EXCEPTION 'small batch wrote an incorrect normalized value';
  END IF;

  IF (SELECT normalized_name FROM ch5_projects WHERE id = 4) IS NOT NULL THEN
    RAISE EXCEPTION 'small batch changed the row after its limit';
  END IF;
END;
$$;

COMMIT;
