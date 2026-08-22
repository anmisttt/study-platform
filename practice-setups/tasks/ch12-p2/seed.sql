-- ch12_cdc_setup.sql — CDC lab: orders -> changelog -> search index
DROP SCHEMA IF EXISTS cdc CASCADE;
CREATE SCHEMA cdc;

CREATE TABLE cdc.orders (
  order_id   BIGINT PRIMARY KEY,
  email      TEXT NOT NULL,
  status     TEXT NOT NULL,
  total_cents INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cdc.cdc_orders_changelog (
  seq        BIGSERIAL PRIMARY KEY,
  op         TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  order_id   BIGINT NOT NULL,
  email      TEXT,
  status     TEXT,
  total_cents INT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE cdc.orders_search (
  order_id   BIGINT PRIMARY KEY,
  email      TEXT NOT NULL,
  status     TEXT NOT NULL,
  total_cents INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE cdc.cdc_consumer_offset (
  consumer_name TEXT PRIMARY KEY,
  last_seq      BIGINT NOT NULL
);
INSERT INTO cdc.cdc_consumer_offset (consumer_name, last_seq)
VALUES ('orders_search', 0);

CREATE OR REPLACE FUNCTION cdc.orders_cdc_trigger()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO cdc.cdc_orders_changelog (op, order_id, email, status, total_cents, updated_at)
    VALUES ('insert', NEW.order_id, NEW.email, NEW.status, NEW.total_cents, NEW.updated_at);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO cdc.cdc_orders_changelog (op, order_id, email, status, total_cents, updated_at)
    VALUES ('update', NEW.order_id, NEW.email, NEW.status, NEW.total_cents, NEW.updated_at);
    RETURN NEW;
  ELSE
    INSERT INTO cdc.cdc_orders_changelog (op, order_id, email, status, total_cents, updated_at)
    VALUES ('delete', OLD.order_id, OLD.email, OLD.status, OLD.total_cents, OLD.updated_at);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER orders_cdc
AFTER INSERT OR UPDATE OR DELETE ON cdc.orders
FOR EACH ROW EXECUTE FUNCTION cdc.orders_cdc_trigger();

CREATE OR REPLACE FUNCTION cdc.apply_orders_cdc(p_limit INT DEFAULT 100)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_last BIGINT;
  v_applied INT := 0;
  r RECORD;
BEGIN
  -- implement: read last_seq for consumer 'orders_search';
  -- for each changelog row with seq > last_seq ORDER BY seq LIMIT p_limit:
  --   insert/update -> upsert into orders_search; delete -> delete from orders_search;
  -- advance last_seq to the highest applied seq; return count applied
  RAISE EXCEPTION 'not implemented';
END;
$$;

-- Dual-write race demo tables (do not use CDC here)
CREATE TABLE cdc.dual_db (order_id BIGINT PRIMARY KEY, status TEXT NOT NULL);
CREATE TABLE cdc.dual_search (order_id BIGINT PRIMARY KEY, status TEXT NOT NULL);
