-- Task 1: unsafe non-transactional redemption
-- TODO: implement the failure demonstration

-- Task 2: transactional redemption
-- TODO: implement the rollback demonstration

-- Task 3: atomic server-side redemption
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

  -- TODO: lock and read the account
  -- TODO: validate the account and balance
  -- TODO: record the redemption atomically

  RAISE EXCEPTION 'NotImplemented';
END;
$$;
