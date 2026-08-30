CREATE TABLE users (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE posts (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title   TEXT NOT NULL
);

INSERT INTO users (id, name) VALUES
  (1, 'Alice'),
  (2, 'Bob'),
  (3, 'Carol');

INSERT INTO posts (id, user_id, title) VALUES
  (101, 1, 'Recursive SQL'),
  (102, 1, 'Document Joins'),
  (103, 2, 'RDF Basics');
