\set ON_ERROR_STOP on

DO $verify$
DECLARE
  additive_schema jsonb := '{
    "entity":"order","fields":[
      {"name":"order_id","kind":"string"},
      {"name":"amount_cents","kind":"integer"},
      {"name":"currency","kind":"string","default":"USD"}
    ]}';
  removal_schema jsonb := '{
    "entity":"order","fields":[
      {"name":"order_id","kind":"string"},
      {"name":"currency","kind":"string","default":"USD"}
    ]}';
  duplicate_name_schema jsonb := '{
    "entity":"order","fields":[
      {"name":"order_id","kind":"string"},
      {"name":"order_id","kind":"string"}
    ]}';
  missing_old_id_raised boolean := false;
BEGIN
  BEGIN
    PERFORM ch5_check_fields_preserved(-1, additive_schema);
  EXCEPTION WHEN OTHERS THEN
    missing_old_id_raised := true;
  END;

  IF NOT missing_old_id_raised THEN
    RAISE EXCEPTION 'an unknown old schema id must raise an exception';
  END IF;

  IF ch5_check_fields_preserved(1, additive_schema) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'an additive candidate must preserve the old field set';
  END IF;

  IF ch5_check_fields_preserved(1, duplicate_name_schema) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'duplicate candidate names cannot replace a missing old field';
  END IF;

  IF ch5_check_fields_preserved(2, removal_schema) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'a candidate that removes an old field must be rejected';
  END IF;

  IF (SELECT schema_json FROM ch5_schemas WHERE schema_id = 2)
       IS DISTINCT FROM additive_schema THEN
    RAISE EXCEPTION 'schema 2 must store the supplied additive candidate';
  END IF;

  IF (SELECT array_agg(schema_id ORDER BY schema_id) FROM ch5_schemas)
       IS DISTINCT FROM ARRAY[1, 2] THEN
    RAISE EXCEPTION 'only schemas 1 and 2 should be registered';
  END IF;

  IF (
    SELECT jsonb_agg(to_jsonb(observed) ORDER BY schema_id)
    FROM (
      SELECT schema_id, order_id, amount_cents, currency
      FROM ch5_consumer_orders
    ) AS observed
  ) IS DISTINCT FROM '[
    {"schema_id":1,"order_id":"ord-100","amount_cents":4999,"currency":"USD"},
    {"schema_id":2,"order_id":"ord-200","amount_cents":1299,"currency":"EUR"}
  ]'::jsonb THEN
    RAISE EXCEPTION 'the consumer view returned unexpected rows';
  END IF;
END
$verify$;

SELECT 'verification passed' AS result;
