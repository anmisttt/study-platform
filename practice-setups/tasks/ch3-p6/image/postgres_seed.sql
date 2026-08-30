CREATE TABLE authors (
  id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE books (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  title     TEXT NOT NULL
);

INSERT INTO authors (name) VALUES
  ('Alice'),
  ('Bob'),
  ('Carol'),
  ('Dan');

INSERT INTO books (author_id, title)
SELECT id, 'Data Systems' FROM authors WHERE name = 'Alice'
UNION ALL
SELECT id, 'Reliable APIs' FROM authors WHERE name = 'Alice'
UNION ALL
SELECT id, 'Python Services' FROM authors WHERE name = 'Bob'
UNION ALL
SELECT id, 'Graph Thinking' FROM authors WHERE name = 'Carol'
UNION ALL
SELECT id, 'RDF in Practice' FROM authors WHERE name = 'Carol'
UNION ALL
SELECT id, 'Query Languages' FROM authors WHERE name = 'Carol';
