DROP TRIGGER IF EXISTS ch5_projects_fill_normalized_name ON ch5_projects;
ALTER TABLE ch5_projects DROP CONSTRAINT IF EXISTS ch5_projects_normalized_name_nn;
DELETE FROM ch5_projects WHERE id = 20001;

CREATE OR REPLACE FUNCTION ch5_normalize_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT lower(btrim(p_name));
$$;

CREATE OR REPLACE FUNCTION ch5_fill_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- TODO: fill normalized_name.
  NEW.normalized_name := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ch5_projects_fill_normalized_name
BEFORE INSERT OR UPDATE OF name ON ch5_projects
FOR EACH ROW
EXECUTE FUNCTION ch5_fill_normalized_name();

-- TODO: add the temporary check.

CREATE OR REPLACE FUNCTION ch5_backfill_normalized_names(
  p_batch_size integer DEFAULT 2000
)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  -- TODO: backfill one batch.
  RETURN 0;
END;
$$;

SELECT count(*) AS rows_to_backfill
FROM ch5_projects
WHERE normalized_name IS NULL;

INSERT INTO ch5_projects (id, name)
VALUES (20001, '  New PROJECT  ');

SELECT id, normalized_name
FROM ch5_projects
WHERE id = 20001;
