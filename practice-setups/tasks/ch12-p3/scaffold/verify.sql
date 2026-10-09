\set ON_ERROR_STOP on

BEGIN;

TRUNCATE cdc.orders, cdc.orders_search, cdc.cdc_orders_changelog RESTART IDENTITY;
UPDATE cdc.cdc_consumer_offset
SET last_seq = 0
WHERE consumer_name = 'orders_search';

INSERT INTO cdc.orders (order_id, email, status, total_cents, updated_at)
VALUES
  (101, 'ada@example.com', 'pending', 2500, TIMESTAMPTZ '2025-01-02 03:04:05+00'),
  (202, 'grace@example.com', 'pending', 4300, TIMESTAMPTZ '2025-02-03 04:05:06+00');
DO $$ BEGIN PERFORM nextval(pg_get_serial_sequence('cdc.cdc_orders_changelog', 'seq')); END $$;
UPDATE cdc.orders
SET email = 'ada+paid@example.com',
    status = 'paid',
    total_cents = 2700,
    updated_at = TIMESTAMPTZ '2025-03-04 05:06:07+00'
WHERE order_id = 101;
DELETE FROM cdc.orders WHERE order_id = 202;

DO $$
BEGIN
  BEGIN
    UPDATE cdc.orders SET order_id = 999 WHERE order_id = 101;
    ASSERT false;
  EXCEPTION
    WHEN raise_exception THEN
      ASSERT SQLERRM = 'order_id is immutable';
  END;
  ASSERT EXISTS (SELECT 1 FROM cdc.orders WHERE order_id = 101);
  ASSERT NOT EXISTS (SELECT 1 FROM cdc.orders WHERE order_id = 999);
END;
$$;

DO $$
DECLARE
  v_ops TEXT[];
BEGIN
  SELECT array_agg(op ORDER BY seq) INTO v_ops
  FROM cdc.cdc_orders_changelog;
  ASSERT v_ops = ARRAY['insert', 'insert', 'update', 'delete'];
END;
$$;

DO $$ BEGIN
  ASSERT cdc.apply_orders_cdc(2) = 2;
  ASSERT (
    SELECT array_agg(ROW(order_id, email, status, total_cents, updated_at)::TEXT ORDER BY order_id)
    FROM cdc.orders_search
  ) = ARRAY[
    ROW(101::BIGINT, 'ada@example.com', 'pending', 2500, TIMESTAMPTZ '2025-01-02 03:04:05+00')::TEXT,
    ROW(202::BIGINT, 'grace@example.com', 'pending', 4300, TIMESTAMPTZ '2025-02-03 04:05:06+00')::TEXT
  ];
  ASSERT (SELECT last_seq FROM cdc.cdc_consumer_offset WHERE consumer_name = 'orders_search') = 2;
END; $$;

DO $$ BEGIN
  ASSERT cdc.apply_orders_cdc(2) = 2;
  ASSERT (
    SELECT ROW(order_id, email, status, total_cents, updated_at)::TEXT
    FROM cdc.orders_search
    WHERE order_id = 101
  ) = ROW(101::BIGINT, 'ada+paid@example.com', 'paid', 2700, TIMESTAMPTZ '2025-03-04 05:06:07+00')::TEXT;
  ASSERT NOT EXISTS (SELECT 1 FROM cdc.orders_search WHERE order_id = 202);
  ASSERT (
    SELECT last_seq
    FROM cdc.cdc_consumer_offset
    WHERE consumer_name = 'orders_search'
  ) = (SELECT max(seq) FROM cdc.cdc_orders_changelog);
END; $$;

DO $$ BEGIN
  ASSERT cdc.apply_orders_cdc(2) = 0;
  ASSERT (SELECT count(*) FROM cdc.orders_search) = 1;
  ASSERT (
    SELECT last_seq
    FROM cdc.cdc_consumer_offset
    WHERE consumer_name = 'orders_search'
  ) = (SELECT max(seq) FROM cdc.cdc_orders_changelog);
END; $$;

ROLLBACK;
SELECT 'consumer verification passed' AS result;
