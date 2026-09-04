DROP SCHEMA IF EXISTS acme CASCADE;
DROP SCHEMA IF EXISTS globex CASCADE;

CREATE SCHEMA acme;
CREATE SCHEMA globex;

CREATE TABLE acme.tickets (
  ticket_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL
);
CREATE TABLE acme.comments (
  comment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id bigint NOT NULL REFERENCES acme.tickets(ticket_id),
  body text NOT NULL
);

CREATE TABLE globex.tickets (
  ticket_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL
);
CREATE TABLE globex.comments (
  comment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id bigint NOT NULL REFERENCES globex.tickets(ticket_id),
  body text NOT NULL
);

-- TODO: distribute both tenant schemas after their tables exist.

SELECT table_name, citus_table_type, colocation_id, nodename
FROM citus_shards
WHERE table_name::text LIKE 'acme.%'
   OR table_name::text LIKE 'globex.%'
ORDER BY table_name::text;
