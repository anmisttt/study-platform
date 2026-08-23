-- PostgreSQL
DROP TABLE IF EXISTS ch2_deps     CASCADE;

DROP TABLE IF EXISTS ch2_packages CASCADE;

CREATE TABLE ch2_packages (
  id      INT  PRIMARY KEY,
  name    TEXT NOT NULL,
  version TEXT NOT NULL
);

CREATE TABLE ch2_deps (
  package_id    INT REFERENCES ch2_packages(id),
  depends_on_id INT REFERENCES ch2_packages(id),
  PRIMARY KEY (package_id, depends_on_id)
);

INSERT INTO ch2_packages VALUES
  (1,'myapp','1.0.0'),(2,'webserver','2.3.1'),(3,'router','1.4.0'),
  (4,'http-lib','3.1.0'),(5,'logger','2.0.0'),(6,'utils','1.1.0'),(7,'crypto','4.2.0');

-- myapp -> webserver -> router -> http-lib
--                    -> logger  -> utils
-- myapp -> logger
-- router -> crypto
INSERT INTO ch2_deps VALUES (1,2),(1,5),(2,3),(2,5),(3,4),(3,7),(5,6);
