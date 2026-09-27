\set ON_ERROR_STOP on

BEGIN;

TRUNCATE ch6_cart_ops RESTART IDENTITY;
TRUNCATE ch6_cart_siblings;
INSERT INTO ch6_cart_siblings (cart_id, version, items)
VALUES
  ('cart-42', 0, '[]'::jsonb),
  ('cart-99', 0, '["tea"]'::jsonb);

DO $test$
DECLARE
  new_version INT;
  w1 INT;
  w2 INT;
  w3 INT;
  w4 INT;
  w5 INT;
  other_version INT;
  versions INT[];
  cart_items JSONB;
BEGIN
  w1 := ch6_apply_cart_write(
    'cart-42', 'client-1', 0, '["milk"]'::jsonb
  );
  w2 := ch6_apply_cart_write(
    'cart-42', 'client-2', 0, '["eggs"]'::jsonb
  );
  w3 := ch6_apply_cart_write(
    'cart-42', 'client-1', 1, '["milk","flour"]'::jsonb
  );
  w4 := ch6_apply_cart_write(
    'cart-42', 'client-2', 2, '["eggs","milk","ham"]'::jsonb
  );
  w5 := ch6_apply_cart_write(
    'cart-42', 'client-1', 3, '["milk","flour","eggs"]'::jsonb
  );

  IF ARRAY[w1, w2, w3, w4, w5] IS DISTINCT FROM ARRAY[1, 2, 3, 4, 5] THEN
    RAISE EXCEPTION 'five-write returned versions are incorrect';
  END IF;

  SELECT array_agg(version ORDER BY version), jsonb_agg(items ORDER BY version)
  INTO versions, cart_items
  FROM ch6_cart_siblings
  WHERE cart_id = 'cart-42';

  IF versions IS DISTINCT FROM ARRAY[4, 5]
     OR cart_items IS DISTINCT FROM
       '[["eggs","milk","ham"],["milk","flour","eggs"]]'::jsonb THEN
    RAISE EXCEPTION 'five-write sibling outcome is incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ch6_cart_siblings
    WHERE cart_id = 'cart-99'
      AND version = 0
      AND items = '["tea"]'::jsonb
  ) THEN
    RAISE EXCEPTION 'second cart seed was changed by cart-42 writes';
  END IF;

  other_version := ch6_apply_cart_write(
    'cart-99', 'client-9', 0, '["tea","coffee"]'::jsonb
  );
  SELECT array_agg(version ORDER BY version), jsonb_agg(items ORDER BY version)
  INTO versions, cart_items
  FROM ch6_cart_siblings
  WHERE cart_id = 'cart-99';

  IF other_version <> 1
     OR versions IS DISTINCT FROM ARRAY[1]
     OR cart_items IS DISTINCT FROM '[["tea","coffee"]]'::jsonb THEN
    RAISE EXCEPTION 'second cart write outcome is incorrect';
  END IF;

  SELECT array_agg(version ORDER BY version), jsonb_agg(items ORDER BY version)
  INTO versions, cart_items
  FROM ch6_cart_siblings
  WHERE cart_id = 'cart-42';

  IF versions IS DISTINCT FROM ARRAY[4, 5]
     OR cart_items IS DISTINCT FROM
       '[["eggs","milk","ham"],["milk","flour","eggs"]]'::jsonb THEN
    RAISE EXCEPTION 'second cart write changed cart-42';
  END IF;

  new_version := ch6_apply_cart_write(
    'cart-42', 'client-3', NULL, '["jam"]'::jsonb
  );
  SELECT array_agg(version ORDER BY version)
  INTO versions
  FROM ch6_cart_siblings
  WHERE cart_id = 'cart-42';

  IF new_version <> 6 OR versions IS DISTINCT FROM ARRAY[4, 5, 6] THEN
    RAISE EXCEPTION 'NULL-base sibling outcome is incorrect';
  END IF;

  new_version := ch6_apply_cart_write(
    'cart-42', 'client-1', 6, '["bread"]'::jsonb
  );
  SELECT array_agg(version ORDER BY version)
  INTO versions
  FROM ch6_cart_siblings
  WHERE cart_id = 'cart-42';

  IF new_version <> 7 OR versions IS DISTINCT FROM ARRAY[7] THEN
    RAISE EXCEPTION 'causal overwrite outcome is incorrect';
  END IF;

  IF (SELECT count(*) FROM ch6_cart_ops) <> 8 OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('cart-42', 'client-1', 0, '["milk"]'::jsonb),
      ('cart-42', 'client-2', 0, '["eggs"]'::jsonb),
      ('cart-42', 'client-1', 1, '["milk","flour"]'::jsonb),
      ('cart-42', 'client-2', 2, '["eggs","milk","ham"]'::jsonb),
      ('cart-42', 'client-1', 3, '["milk","flour","eggs"]'::jsonb),
      ('cart-99', 'client-9', 0, '["tea","coffee"]'::jsonb),
      ('cart-42', 'client-3', NULL::INT, '["jam"]'::jsonb),
      ('cart-42', 'client-1', 6, '["bread"]'::jsonb)
    ) AS expected(cart_id, client_id, base_version, items)
    WHERE NOT EXISTS (
      SELECT 1
      FROM ch6_cart_ops AS actual
      WHERE actual.cart_id = expected.cart_id
        AND actual.client_id = expected.client_id
        AND actual.base_version IS NOT DISTINCT FROM expected.base_version
        AND actual.items = expected.items
    )
  ) THEN
    RAISE EXCEPTION 'operation logging outcome is incorrect';
  END IF;
END;
$test$;

ROLLBACK;

SELECT 'verification passed' AS result;
