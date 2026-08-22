-- ch12_eos_setup.sql — Postgres sink for Kafka effectively-once lab
DROP SCHEMA IF EXISTS eos CASCADE;
CREATE SCHEMA eos;

CREATE TABLE eos.accounts (
  account_id TEXT PRIMARY KEY,
  balance_cents BIGINT NOT NULL,
  last_offset BIGINT NOT NULL DEFAULT -1
);
INSERT INTO eos.accounts (account_id, balance_cents) VALUES ('alice', 0);
