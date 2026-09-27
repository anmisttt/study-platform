DROP TABLE IF EXISTS ch5_events CASCADE;

DROP TABLE IF EXISTS ch5_schemas CASCADE;

CREATE TABLE ch5_schemas (
  schema_id   INT PRIMARY KEY,
  schema_json JSONB NOT NULL,
  compatibility TEXT NOT NULL DEFAULT 'PRESERVE_FIELDS'
);

CREATE TABLE ch5_events (
  id          BIGSERIAL PRIMARY KEY,
  schema_id   INT NOT NULL REFERENCES ch5_schemas(schema_id),
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO ch5_schemas (schema_id, schema_json) VALUES
(1, '{"entity":"order","fields":[
  {"name":"order_id","kind":"string"},
  {"name":"amount_cents","kind":"integer"}
]}');

INSERT INTO ch5_events (schema_id, payload) VALUES
(1, '{"order_id":"ord-100","amount_cents":4999}');
