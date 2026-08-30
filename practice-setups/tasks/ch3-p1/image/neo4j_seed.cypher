CREATE CONSTRAINT person_user_id IF NOT EXISTS
FOR (person:Person) REQUIRE person.userId IS UNIQUE;

MERGE (alice:Person {userId: '1'})
MERGE (bob:Person {userId: '2'})
MERGE (carol:Person {userId: '3'})
MERGE (alice)-[aliceBob:FOLLOWS]->(bob)
SET aliceBob.position = 1
MERGE (alice)-[aliceCarol:FOLLOWS]->(carol)
SET aliceCarol.position = 2
MERGE (bob)-[bobCarol:FOLLOWS]->(carol)
SET bobCarol.position = 1;
