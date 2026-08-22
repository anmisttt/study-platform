-- ch4_orders_uuid_setup.sql
CREATE DATABASE IF NOT EXISTS ch4_lab;
USE ch4_lab;

DROP TABLE IF EXISTS orders;

CREATE TABLE orders (
  -- TODO: replace random UUIDv4 clustered PK with a monotonic key
  --       (UUIDv7 / ULID / BIGINT AUTO_INCREMENT); dual-write the new id first
  id            BINARY(16)    NOT NULL PRIMARY KEY,   -- stores a UUIDv4 (random leaf inserts)
  customer_id   BIGINT        NOT NULL,
  status        VARCHAR(32)   NOT NULL,
  total_amount  DECIMAL(10,2) NOT NULL,
  created_at    DATETIME(6)   NOT NULL,
  notes         VARCHAR(500)  NULL
) ENGINE = InnoDB;

CREATE INDEX orders_customer_recent_idx ON orders (customer_id, created_at);
CREATE INDEX orders_status_idx ON orders (status);
