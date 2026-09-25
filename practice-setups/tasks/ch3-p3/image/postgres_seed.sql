CREATE TABLE packages (
  id      INT PRIMARY KEY,
  name    TEXT UNIQUE NOT NULL,
  version TEXT NOT NULL
);

CREATE TABLE deps (
  package_id    INT REFERENCES packages(id),
  depends_on_id INT REFERENCES packages(id),
  PRIMARY KEY (package_id, depends_on_id)
);

INSERT INTO packages VALUES
  (1, 'myapp',     '1.0.0'),
  (2, 'webserver', '2.3.1'),
  (3, 'router',    '1.4.0'),
  (4, 'http-lib',  '3.1.0'),
  (5, 'logger',    '2.0.0'),
  (6, 'utils',     '1.1.0'),
  (7, 'crypto',    '4.2.0');

INSERT INTO deps VALUES
  (1, 2),
  (1, 5),
  (2, 3),
  (2, 5),
  (3, 4),
  (3, 7),
  (5, 6);
