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
WHERE  FALSE;
