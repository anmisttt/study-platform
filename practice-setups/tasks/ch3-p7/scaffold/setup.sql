-- OrientDB SQL — run in DBeaver (Driver: OrientDB) against demodb (Docker: localhost:2424, root/root).
-- On a fresh empty DB you can skip the DROP CLASS lines; IF EXISTS avoids errors on first run.

DROP CLASS FOLLOWS IF EXISTS UNSAFE;
DROP CLASS Person   IF EXISTS UNSAFE;

CREATE CLASS Person  EXTENDS V;
CREATE CLASS FOLLOWS EXTENDS E;

CREATE VERTEX Person SET name='Alice', city='Berlin';
CREATE VERTEX Person SET name='Bob',   city='London';
CREATE VERTEX Person SET name='Carol', city='Berlin';
CREATE VERTEX Person SET name='Dan',   city='Amsterdam';
CREATE VERTEX Person SET name='Eve',   city='Berlin';
CREATE VERTEX Person SET name='Frank', city='London';

CREATE EDGE FOLLOWS FROM (SELECT FROM Person WHERE name='Alice') TO (SELECT FROM Person WHERE name='Bob');
CREATE EDGE FOLLOWS FROM (SELECT FROM Person WHERE name='Alice') TO (SELECT FROM Person WHERE name='Carol');
CREATE EDGE FOLLOWS FROM (SELECT FROM Person WHERE name='Bob')   TO (SELECT FROM Person WHERE name='Dan');
CREATE EDGE FOLLOWS FROM (SELECT FROM Person WHERE name='Carol') TO (SELECT FROM Person WHERE name='Dan');
CREATE EDGE FOLLOWS FROM (SELECT FROM Person WHERE name='Dan')   TO (SELECT FROM Person WHERE name='Eve');
CREATE EDGE FOLLOWS FROM (SELECT FROM Person WHERE name='Eve')   TO (SELECT FROM Person WHERE name='Frank');

-- Graph: Alice → Bob → Dan → Eve → Frank
--        Alice → Carol → Dan

-- Part A stub: traverse FOLLOWS outward from Alice up to depth 2
SELECT $depth AS depth, name, city
FROM (
  TRAVERSE out('FOLLOWS')
  FROM (SELECT FROM Person WHERE name = 'Alice')
  WHILE FALSE  -- implement: $depth <= 2
)
WHERE TRUE  -- implement: name <> 'Alice'
ORDER BY $depth, name;

-- Part B stub: shortest directed path Alice → Frank along FOLLOWS
SELECT shortestPath(
  (SELECT FROM Person WHERE name = 'Alice'),
  (SELECT FROM Person WHERE name = 'Frank'),
  'OUT',   -- keep OUT direction
  NULL     -- implement: edge class 'FOLLOWS'
).name AS path
FROM Person
LIMIT 1;
