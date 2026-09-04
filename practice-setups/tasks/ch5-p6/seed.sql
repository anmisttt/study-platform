-- Pre-seeded state: a live table that still lacks the computed column values.
DROP TABLE IF EXISTS ch5_projects CASCADE;

CREATE TABLE ch5_projects (
  id bigint PRIMARY KEY,
  name text NOT NULL
);

INSERT INTO ch5_projects (id, name)
SELECT g, '  Project ' || g || '  '
FROM generate_series(1, 20000) AS g;

ALTER TABLE ch5_projects ADD COLUMN normalized_name text;
