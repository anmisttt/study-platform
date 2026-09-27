\set ON_ERROR_STOP on

BEGIN;

INSERT INTO flights (id, route) VALUES (2, 'NYC-SFO');
INSERT INTO seat_reservations (flight_id, seat_no, user_id)
VALUES
  (1, '14A', 201),
  (2, '14A', 202),
  (1, '14B', 203);

DO $$
BEGIN
  BEGIN
    INSERT INTO seat_reservations (flight_id, seat_no, user_id)
    VALUES (1, '14A', 204);
    RAISE EXCEPTION 'duplicate reservation was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END
$$;

ROLLBACK;
\echo unique constraint verified
