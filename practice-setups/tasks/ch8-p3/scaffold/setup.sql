-- setup.sql — flight seat booking (DDIA ch8)
DROP TABLE IF EXISTS seat_reservations;
DROP TABLE IF EXISTS flights;

CREATE TABLE flights (
  id    SERIAL PRIMARY KEY,
  route TEXT   NOT NULL
);

CREATE TABLE seat_reservations (
  id        SERIAL PRIMARY KEY,
  flight_id INT  NOT NULL REFERENCES flights(id),
  seat_no   TEXT NOT NULL,
  user_id   INT  NOT NULL
  -- add UNIQUE (flight_id, seat_no) to prevent double-booking
);

INSERT INTO flights VALUES (1, 'NYC-LON');
