\set ON_ERROR_STOP on

TRUNCATE redemptions RESTART IDENTITY;
UPDATE loyalty_accounts
SET points = CASE user_id WHEN 1 THEN 500 WHEN 2 THEN 80 END
WHERE user_id IN (1, 2);

SELECT redeem_points(1, 100);

DO $$
DECLARE
  remaining_points INT;
  redemption_count INT;
  error_message TEXT;
BEGIN
  SELECT points INTO remaining_points
  FROM loyalty_accounts
  WHERE user_id = 1;

  SELECT count(*) INTO redemption_count
  FROM redemptions
  WHERE user_id = 1 AND points_used = 100;

  IF remaining_points <> 400 OR redemption_count <> 1 THEN
    RAISE EXCEPTION 'successful redemption produced the wrong state';
  END IF;

  BEGIN
    PERFORM redeem_points(2, 500);
  EXCEPTION WHEN OTHERS THEN
    error_message := SQLERRM;
  END;

  IF error_message IS NULL OR error_message NOT ILIKE '%insufficient%' THEN
    RAISE EXCEPTION 'insufficient balance must raise an identifying error';
  END IF;

  SELECT points INTO remaining_points
  FROM loyalty_accounts
  WHERE user_id = 2;

  SELECT count(*) INTO redemption_count
  FROM redemptions
  WHERE user_id = 2;

  IF remaining_points <> 80 OR redemption_count <> 0 THEN
    RAISE EXCEPTION 'failed redemption changed account state';
  END IF;

  error_message := NULL;

  BEGIN
    PERFORM redeem_points(999, 10);
  EXCEPTION WHEN OTHERS THEN
    error_message := SQLERRM;
  END;

  IF error_message IS NULL OR error_message NOT ILIKE '%account%' THEN
    RAISE EXCEPTION 'missing account must raise an identifying error';
  END IF;
END;
$$;

SELECT 'loyalty redemption checks passed' AS result;
