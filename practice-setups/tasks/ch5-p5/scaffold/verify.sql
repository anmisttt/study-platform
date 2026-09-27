\set ON_ERROR_STOP on

DO $$
DECLARE
  v_normalized_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ch5_projects
    WHERE normalized_name IS NULL
       OR normalized_name IS DISTINCT FROM ch5_normalize_name(name)
  ) THEN
    RAISE EXCEPTION 'backfill is incomplete or incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'ch5_projects'::regclass
      AND attname = 'normalized_name'
      AND attnotnull
  ) THEN
    RAISE EXCEPTION 'normalized_name is not NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ch5_projects'::regclass
      AND conname = 'ch5_projects_normalized_name_nn'
  ) THEN
    RAISE EXCEPTION 'temporary check still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS i
    JOIN pg_class AS idx ON idx.oid = i.indexrelid
    WHERE i.indrelid = 'ch5_projects'::regclass
      AND idx.relname = 'ch5_projects_normalized_name_idx'
      AND i.indisvalid
      AND pg_get_indexdef(i.indexrelid) LIKE '% (normalized_name)'
  ) THEN
    RAISE EXCEPTION 'normalized_name index is missing or invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_stat_all_tables
    WHERE relid = 'ch5_projects'::regclass
      AND last_analyze IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ch5_projects statistics were not refreshed with ANALYZE';
  END IF;

  IF ch5_backfill_normalized_names(10) <> 0 THEN
    RAISE EXCEPTION 'completed backfill should update zero rows';
  END IF;

  DELETE FROM ch5_projects WHERE id = 20002;
  INSERT INTO ch5_projects (id, name) VALUES (20002, '  Mixed CASE  ');
  SELECT normalized_name INTO v_normalized_name
  FROM ch5_projects
  WHERE id = 20002;
  IF v_normalized_name <> 'mixed case' THEN
    RAISE EXCEPTION 'insert trigger did not normalize the name';
  END IF;

  UPDATE ch5_projects SET name = '  Renamed PROJECT  ' WHERE id = 20002;
  SELECT normalized_name INTO v_normalized_name
  FROM ch5_projects
  WHERE id = 20002;
  IF v_normalized_name <> 'renamed project' THEN
    RAISE EXCEPTION 'update trigger did not normalize the name';
  END IF;
  DELETE FROM ch5_projects WHERE id = 20002;
END;
$$;
