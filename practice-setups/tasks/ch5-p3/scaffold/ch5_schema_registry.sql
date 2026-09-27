DELETE FROM ch5_events WHERE schema_id > 1;
DELETE FROM ch5_schemas WHERE schema_id > 1;

DROP VIEW IF EXISTS ch5_consumer_orders;
DROP FUNCTION IF EXISTS ch5_check_fields_preserved(integer, jsonb);

-- TODO: create the field-preservation function

-- TODO: register schema 2 and its event through the compatibility gate

-- TODO: attempt schema 3 through the gate and create the consumer view
