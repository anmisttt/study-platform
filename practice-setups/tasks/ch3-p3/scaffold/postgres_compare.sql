-- Task 1: dependencies reachable from myapp.
WITH RECURSIVE all_deps(dep_id, depth, path) AS (
  -- implement: direct dependencies
  SELECT NULL::INT, NULL::INT, ARRAY[]::INT[]
  WHERE FALSE

  UNION ALL

  -- implement: recursive outbound traversal with cycle guard
  SELECT NULL::INT, NULL::INT, ARRAY[]::INT[]
  FROM all_deps ad
  WHERE FALSE
)
SELECT p.name, p.version, MIN(ad.depth) AS min_hops
FROM all_deps ad
JOIN ch2_packages p ON p.id = ad.dep_id
GROUP BY p.name, p.version
ORDER BY min_hops, p.name;

-- Task 2: packages affected by a change to utils.
WITH RECURSIVE impacted(pkg_id, depth, path) AS (
  -- implement: direct dependents
  SELECT NULL::INT, NULL::INT, ARRAY[]::INT[]
  WHERE FALSE

  UNION ALL

  -- implement: recursive inbound traversal with cycle guard
  SELECT NULL::INT, NULL::INT, ARRAY[]::INT[]
  FROM impacted i
  WHERE FALSE
)
SELECT p.name, p.version, MIN(i.depth) AS hops_from_utils
FROM impacted i
JOIN ch2_packages p ON p.id = i.pkg_id
GROUP BY p.name, p.version
ORDER BY hops_from_utils, p.name;
