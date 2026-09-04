-- ch8_loyalty_redeem.sql
-- Lab: atomic loyalty-point redemption (DDIA ch8 transactions)

DROP TABLE IF EXISTS redemptions CASCADE;
DROP TABLE IF EXISTS loyalty_accounts CASCADE;
DROP FUNCTION IF EXISTS redeem_points(INT, INT);

CREATE TABLE loyalty_accounts (
  user_id INT     PRIMARY KEY,
  points  INT     NOT NULL CHECK (points >= 0)
);

CREATE TABLE redemptions (
  id          SERIAL      PRIMARY KEY,
  user_id     INT         NOT NULL REFERENCES loyalty_accounts(user_id),
  points_used INT         NOT NULL CHECK (points_used > 0),
  redeemed_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO loyalty_accounts VALUES (1, 500), (2, 80);

-- ---------------------------------------------------------------------------
-- Task 1 stub: unsafe non-transactional redemption (edit and run in psql)
-- Deduct first, then fail before the INSERT so the deduction sticks.
-- Expected: ERROR from RAISE; user 1 points=400; zero redemption rows for user 1.
-- ---------------------------------------------------------------------------
-- UPDATE loyalty_accounts
-- SET points = points - 100
-- WHERE user_id = 1;
-- -- implement: induce mid-path failure (must be a DO block — bare RAISE is not SQL)
-- DO $$ BEGIN RAISE EXCEPTION 'simulated crash after deduct'; END $$;
-- INSERT INTO redemptions (user_id, points_used)
-- VALUES (1, 100);

-- ---------------------------------------------------------------------------
-- Task 2 stub: same two writes inside one transaction (edit and run in psql)
-- Put the UPDATE, the same RAISE, and the INSERT between BEGIN and COMMIT.
-- Expected: ERROR from RAISE; user 1 points still 500; no redemption row.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- -- TODO: UPDATE deduct 100 from user 1
-- -- TODO: DO $$ BEGIN RAISE EXCEPTION 'simulated crash after deduct'; END $$;
-- -- TODO: INSERT redemption for user 1 / 100 points
-- COMMIT;

-- ---------------------------------------------------------------------------
-- Task 3 stub: redeem_points stored procedure
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION redeem_points(
  p_user_id INT,
  p_points  INT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  current_points INT;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Redemption amount must be positive, got %', p_points;
  END IF;

  -- TODO: SELECT points INTO current_points ... FOR UPDATE (lock account row)
  -- implement: lock + read balance for p_user_id

  -- TODO: validate account exists (current_points IS NULL -> RAISE)
  -- TODO: validate sufficient balance (current_points < p_points -> RAISE)

  -- TODO: UPDATE loyalty_accounts SET points = points - p_points WHERE user_id = p_user_id
  -- TODO: INSERT INTO redemptions (user_id, points_used) VALUES (p_user_id, p_points)

  RAISE EXCEPTION 'NotImplemented: complete redeem_points lock/validate/write sites';
END;
$$;

-- Usage checks (run after implementing Task 3):
-- SELECT redeem_points(1, 100);
-- SELECT points FROM loyalty_accounts WHERE user_id = 1;   -- expect 400
-- SELECT count(*) FROM redemptions WHERE user_id = 1;      -- expect 1
-- SELECT redeem_points(2, 500);  -- expect ERROR: Insufficient points ...
