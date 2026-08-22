DROP TABLE IF EXISTS ch5_events CASCADE;
DROP TABLE IF EXISTS ch5_schemas CASCADE;

CREATE TABLE ch5_schemas (
  schema_id   INT PRIMARY KEY,
  schema_json JSONB NOT NULL,
  compatibility TEXT NOT NULL DEFAULT 'FORWARD'
);

CREATE TABLE ch5_events (
  id          BIGSERIAL PRIMARY KEY,
  schema_id   INT NOT NULL REFERENCES ch5_schemas(schema_id),
  payload     JSONB NOT NULL,  -- stand in for Avro bytes
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO ch5_schemas (schema_id, schema_json) VALUES
(1, '{"type":"record","name":"Order","fields":[
  {"name":"order_id","type":"string"},
  {"name":"amount_cents","type":"int"}
]}');

INSERT INTO ch5_events (schema_id, payload) VALUES
(1, '{"order_id":"ord-100","amount_cents":4999}');

-- Task 1: implement forward-safe gate — return TRUE iff every old field name exists in new_json
-- CREATE OR REPLACE FUNCTION ch5_check_forward_safe(old_id INT, new_json JSONB)
-- RETURNS BOOLEAN LANGUAGE plpgsql AS $$
-- DECLARE
--   -- TODO: load old schema fields; walk new_json->'fields'
-- BEGIN
--   -- TODO: RETURN FALSE if any old field name is missing; else RETURN TRUE
-- END;
-- $$;

-- Task 1: register schema v2 (add optional currency default USD) after check returns TRUE
-- SELECT ch5_check_forward_safe(1, '{
--   "type":"record","name":"Order","fields":[
--     {"name":"order_id","type":"string"},
--     {"name":"amount_cents","type":"int"},
--     {"name":"currency","type":"string","default":"USD"}
--   ]}'::jsonb);
-- -- expect TRUE, then:
-- INSERT INTO ch5_schemas (schema_id, schema_json) VALUES
-- (2, '{"type":"record","name":"Order","fields":[
--   {"name":"order_id","type":"string"},
--   {"name":"amount_cents","type":"int"},
--   {"name":"currency","type":"string","default":"USD"}
-- ]}');
-- INSERT INTO ch5_events (schema_id, payload) VALUES
-- (2, '{"order_id":"ord-200","amount_cents":1299,"currency":"EUR"}');

-- Task 2: attempt schema v3 that removes amount_cents — must NOT INSERT when FALSE
-- SELECT ch5_check_forward_safe(2, '{
--   "type":"record","name":"Order","fields":[
--     {"name":"order_id","type":"string"},
--     {"name":"currency","type":"string","default":"USD"}
--   ]}'::jsonb);
-- -- expect FALSE; do not INSERT schema_id 3

-- Task 3: old consumer query — v1-safe shape + COALESCE currency to USD
-- SELECT e.schema_id,
--        e.payload->>'order_id' AS order_id,
--        (e.payload->>'amount_cents')::int AS amount_cents,
--        COALESCE(e.payload->>'currency', 'USD') AS currency
-- FROM   ch5_events e;
