CREATE OR REPLACE FUNCTION cdc.apply_orders_cdc(p_limit INT DEFAULT 100)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_last BIGINT;
  v_applied INT := 0;
  r RECORD;
BEGIN
  -- implement: outbox consumer
  RAISE EXCEPTION 'not implemented';
END;
$$;
