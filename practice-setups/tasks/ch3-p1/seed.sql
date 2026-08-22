-- PostgreSQL
DROP TABLE IF EXISTS ch2_job_postings_raw CASCADE;
DROP TABLE IF EXISTS ch2_job_postings  CASCADE;
DROP TABLE IF EXISTS ch2_companies     CASCADE;
DROP TABLE IF EXISTS ch2_cities        CASCADE;
DROP TABLE IF EXISTS ch2_job_categories CASCADE;

CREATE TABLE ch2_job_postings_raw (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  company_name TEXT NOT NULL,
  city         TEXT NOT NULL,
  category     TEXT NOT NULL
);

INSERT INTO ch2_job_postings_raw (title, company_name, city, category) VALUES
  ('Backend Engineer',   'Acme Corp',      'Berlin',    'Engineering'),
  ('Data Analyst',       'Acme Corp',      'Berlin',    'Analytics'),
  ('iOS Developer',      'Acme Corp',      'London',    'Engineering'),
  ('Product Manager',    'Acme Corp',      'Berlin',    'Product'),
  ('Marketing Manager',  'Acme Corp',      'London',    'Marketing'),
  ('Frontend Engineer',  'Bright Systems', 'Berlin',    'Engineering'),
  ('DevOps Lead',        'Bright Systems', 'Amsterdam', 'Engineering'),
  ('Data Scientist',     'Bright Systems', 'Berlin',    'Analytics');

-- Part A stubs: denormalized rename
UPDATE ch2_job_postings_raw
SET    company_name = company_name  -- implement: set to 'Acme Technologies' where name is 'Acme Corp'
WHERE  FALSE;                       -- implement: company_name = 'Acme Corp'

SELECT id, title, company_name
FROM   ch2_job_postings_raw
WHERE  FALSE;  -- implement: company_name = 'Acme Technologies'

-- Part B stubs: normalize, then rename one lookup row
-- implement: CREATE lookup tables ch2_companies, ch2_cities, ch2_job_categories (id SERIAL PK, name TEXT UNIQUE NOT NULL)
-- implement: CREATE ch2_job_postings (title + company_id/city_id/category_id FKs to the lookups)
-- implement: INSERT DISTINCT names into each lookup from ch2_job_postings_raw
-- implement: INSERT migrate postings via JOINs on company_name/city/category to lookup ids
-- implement: UPDATE ch2_companies rename 'Acme Technologies' -> 'Acme Corp Inc' (one row; raw already renamed in Part A)
-- implement: SELECT jp.title, company, city, category via JOINs WHERE company = 'Acme Corp Inc' (expect 5 rows)
