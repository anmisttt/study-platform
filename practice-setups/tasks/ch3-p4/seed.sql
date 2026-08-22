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

-- Part A stub: plain SELECT of myapp's direct dependencies (no recursion)
SELECT
  NULL AS dependency,
  NULL AS version
-- implement: FROM/JOIN/WHERE for myapp's direct depends_on_id rows (no recursion)
;

-- Part B stub: recursive CTE for all transitive deps of myapp with min hop count
WITH RECURSIVE all_deps AS (
  -- implement: base case — direct deps of myapp at depth 1
  SELECT NULL::int AS dep_id, NULL::int AS depth
  WHERE FALSE

  UNION  -- implement: use UNION (not UNION ALL) to avoid infinite loops if cycles exist

  -- implement: recursive step — walk outbound depends_on edges, depth + 1
  SELECT NULL::int, NULL::int
  WHERE FALSE
)
SELECT p.name, p.version, MIN(all_deps.depth) AS min_hops
FROM   all_deps
JOIN   ch2_packages p ON p.id = all_deps.dep_id
GROUP BY p.name, p.version
ORDER BY min_hops, p.name;

-- Part C stub: reverse recursive CTE — packages that depend on utils
WITH RECURSIVE dependents AS (
  -- implement: base case — packages that directly depend on utils at depth 1
  SELECT NULL::int AS pkg_id, NULL::int AS depth
  WHERE FALSE

  UNION  -- implement: use UNION (not UNION ALL) to avoid cycles

  -- implement: recursive step — follow incoming edges upward
  SELECT NULL::int, NULL::int
  WHERE FALSE
)
SELECT p.name, p.version, MIN(dependents.depth) AS hops_from_utils
FROM   dependents
JOIN   ch2_packages p ON p.id = dependents.pkg_id
GROUP BY p.name, p.version
ORDER BY hops_from_utils, p.name;
