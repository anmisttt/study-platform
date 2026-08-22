-- PREPARE TRANSACTION needs a non-zero slot count; applied at image build time
-- and picked up when the container starts Postgres.
ALTER SYSTEM SET max_prepared_transactions = 10;

DROP TABLE IF EXISTS passenger_charges;
DROP TABLE IF EXISTS driver_earnings;

-- Node A: earnings
CREATE TABLE driver_earnings (
  driver_id    INT     PRIMARY KEY,
  total_earned NUMERIC NOT NULL DEFAULT 0
);
INSERT INTO driver_earnings VALUES (7, 0);

-- Node B: billing
CREATE TABLE passenger_charges (
  id           SERIAL  PRIMARY KEY,
  trip_id      INT     NOT NULL,
  passenger_id INT     NOT NULL,
  amount       NUMERIC NOT NULL CHECK (amount > 0)
);
