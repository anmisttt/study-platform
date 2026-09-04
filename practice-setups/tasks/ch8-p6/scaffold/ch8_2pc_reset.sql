-- ch8_2pc_reset.sql — run between demos.
-- The ROLLBACK PREPARED lines error with "prepared transaction does not exist"
-- when that GID is not outstanding; ignore those errors.
ROLLBACK PREPARED 'txn-trip-555-A';
ROLLBACK PREPARED 'txn-trip-555-B';
ROLLBACK PREPARED 'txn-trip-556-A';
ROLLBACK PREPARED 'txn-trip-557-A';
ROLLBACK PREPARED 'txn-trip-557-B';
TRUNCATE passenger_charges RESTART IDENTITY;
UPDATE driver_earnings SET total_earned = 0 WHERE driver_id = 7;
