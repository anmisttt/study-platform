-- PostgreSQL
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
