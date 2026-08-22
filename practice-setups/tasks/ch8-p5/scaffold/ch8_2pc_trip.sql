-- ch8_2pc_trip.sql — the schema the image already applied. Re-apply it only if
-- you need to rebuild both tables from scratch.
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
