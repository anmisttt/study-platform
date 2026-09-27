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
