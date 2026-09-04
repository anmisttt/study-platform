-- ch6_cart_siblings.sql
-- Lab: version-number sibling detection for concurrent shopping-cart writes (DDIA ch6)
DROP TABLE IF EXISTS ch6_cart_siblings CASCADE;

DROP TABLE IF EXISTS ch6_cart_ops CASCADE;

CREATE TABLE ch6_cart_siblings (
  cart_id    TEXT NOT NULL,
  version    INT  NOT NULL,
  items      JSONB NOT NULL,
  PRIMARY KEY (cart_id, version)
);

CREATE TABLE ch6_cart_ops (
  op_id        SERIAL PRIMARY KEY,
  cart_id      TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  base_version INT,
  items        JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Initial empty cart for cart-42
INSERT INTO ch6_cart_siblings (cart_id, version, items) VALUES
  ('cart-42', 0, '[]'::jsonb);

CREATE OR REPLACE FUNCTION ch6_apply_cart_write(
  p_cart_id TEXT,
  p_client_id TEXT,
  p_base_version INT,
  p_new_items JSONB
) RETURNS INT
LANGUAGE plpgsql AS $$
BEGIN
  -- implement: log op; new_version = max(version)+1;
  -- delete siblings with version <= p_base_version (NULL base => delete nothing);
  -- insert (p_cart_id, new_version, p_new_items); return new_version
  RAISE EXCEPTION 'not implemented';
END;
$$;
