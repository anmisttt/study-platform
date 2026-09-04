-- ch13_idempotent_transfer_setup.sql
DROP SCHEMA IF EXISTS xfer CASCADE;
CREATE SCHEMA xfer;

CREATE TABLE xfer.accounts (
  account_id TEXT PRIMARY KEY,
  balance_cents BIGINT NOT NULL CHECK (balance_cents >= 0)
);
INSERT INTO xfer.accounts VALUES ('alice', 10000), ('bob', 0);

CREATE TABLE xfer.requests (
  request_id TEXT PRIMARY KEY,
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
