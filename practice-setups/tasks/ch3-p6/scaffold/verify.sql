\set ON_ERROR_STOP on

DO $$
DECLARE
  migrated_rows integer;
  joined_rows integer;
  joined_acme_rows integer;
BEGIN
  IF (SELECT count(*) FROM job_postings_raw WHERE company_name = 'Acme Technologies') <> 5
     OR EXISTS (SELECT 1 FROM job_postings_raw WHERE company_name = 'Acme Corp') THEN
    RAISE EXCEPTION 'denormalized rename is incomplete';
  END IF;

  IF (SELECT count(*) FROM companies) <> 2
     OR (SELECT count(*) FROM cities) <> 3
     OR (SELECT count(*) FROM job_categories) <> 4
     OR (SELECT count(*) FROM job_postings) <> 8 THEN
    RAISE EXCEPTION 'lookup or posting migration is incomplete';
  END IF;

  IF (
    SELECT count(*)
      FROM (VALUES
        ('companies'::regclass),
        ('cities'::regclass),
        ('job_categories'::regclass)
      ) AS expected(table_oid)
     WHERE EXISTS (
       SELECT 1
         FROM pg_constraint AS constraint_def
         JOIN pg_attribute AS column_def
           ON column_def.attrelid = constraint_def.conrelid
          AND column_def.attnum = constraint_def.conkey[1]
        WHERE constraint_def.contype = 'u'
          AND constraint_def.conrelid = expected.table_oid
          AND cardinality(constraint_def.conkey) = 1
          AND column_def.attname = 'name'
     )
  ) <> 3 THEN
    RAISE EXCEPTION 'lookup name columns must have UNIQUE constraints';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_def
      JOIN pg_attribute AS column_def
        ON column_def.attrelid = constraint_def.conrelid
       AND column_def.attnum = constraint_def.conkey[1]
     WHERE constraint_def.contype = 'p'
       AND constraint_def.conrelid = 'job_postings'::regclass
       AND cardinality(constraint_def.conkey) = 1
       AND column_def.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'normalized posting id must be its primary key';
  END IF;

  IF (
    SELECT count(*)
      FROM (VALUES
        ('company_id', 'companies'::regclass, 'id'),
        ('city_id', 'cities'::regclass, 'id'),
        ('category_id', 'job_categories'::regclass, 'id')
      ) AS expected(source_column, target_table, target_column)
     WHERE EXISTS (
       SELECT 1
         FROM pg_constraint AS constraint_def
         JOIN pg_attribute AS source_def
           ON source_def.attrelid = constraint_def.conrelid
          AND source_def.attnum = constraint_def.conkey[1]
         JOIN pg_attribute AS target_def
           ON target_def.attrelid = constraint_def.confrelid
          AND target_def.attnum = constraint_def.confkey[1]
        WHERE constraint_def.contype = 'f'
          AND constraint_def.conrelid = 'job_postings'::regclass
          AND constraint_def.confrelid = expected.target_table
          AND cardinality(constraint_def.conkey) = 1
          AND cardinality(constraint_def.confkey) = 1
          AND source_def.attname = expected.source_column
          AND target_def.attname = expected.target_column
     )
  ) <> 3 THEN
    RAISE EXCEPTION 'normalized posting foreign keys are incomplete';
  END IF;

  IF (SELECT count(*) FROM companies WHERE name = 'Acme Corp Inc') <> 1
     OR EXISTS (SELECT 1 FROM companies WHERE name = 'Acme Technologies') THEN
    RAISE EXCEPTION 'single-row lookup rename is incomplete';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE companies.name = 'Acme Corp Inc')
    INTO joined_rows, joined_acme_rows
    FROM job_postings AS postings
    JOIN companies AS companies ON companies.id = postings.company_id
    JOIN cities AS cities ON cities.id = postings.city_id
    JOIN job_categories AS categories ON categories.id = postings.category_id;

  SELECT count(*)
    INTO migrated_rows
    FROM job_postings_raw AS raw
    JOIN job_postings AS postings ON postings.title = raw.title
    JOIN companies AS companies ON companies.id = postings.company_id
    JOIN cities AS cities ON cities.id = postings.city_id
    JOIN job_categories AS categories ON categories.id = postings.category_id
   WHERE companies.name = CASE
           WHEN raw.company_name = 'Acme Technologies' THEN 'Acme Corp Inc'
           ELSE raw.company_name
         END
     AND cities.name = raw.city
     AND categories.name = raw.category;

  IF joined_rows <> 8 OR joined_acme_rows <> 5 OR migrated_rows <> 8 THEN
    RAISE EXCEPTION 'joined normalized results are incorrect';
  END IF;
END
$$;

SELECT 'verification passed' AS result;
