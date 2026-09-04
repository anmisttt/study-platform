-- ch5_user_profiles.sql — runs against the pre-seeded ch5_user_profiles table
-- (user 1 alice with display_name 'Alice T.', user 2 bob with NULL).

-- Restore the seeded state so this file can be re-applied:
UPDATE ch5_user_profiles
SET    email = 'alice@example.com',
       bio = 'Platform engineer',
       display_name = 'Alice T.'
WHERE  user_id = 1;

-- Task 1: implement the bad v1 UPDATE that sets only known columns and NULLs display_name
-- UPDATE ch5_user_profiles
-- SET    email = ...,
--        bio = ...,
--        display_name = NULL   -- wipe: ORM wrote only columns it knows
-- WHERE  user_id = 1;
-- Verify Task 1: SELECT user_id, display_name FROM ch5_user_profiles WHERE user_id = 1;
-- Expect: display_name IS NULL

-- Task 2: implement the safe narrow v1 bio UPDATE that does NOT list display_name (preserves existing value)
-- First restore alice for the demo:
-- UPDATE ch5_user_profiles SET display_name = 'Alice T.' WHERE user_id = 1;
-- Then:
-- UPDATE ch5_user_profiles
-- SET    bio = ...
-- WHERE  user_id = 1;
-- Verify Task 2: SELECT user_id, bio, display_name FROM ch5_user_profiles WHERE user_id = 1;
-- Expect: bio updated, display_name still 'Alice T.'

-- Task 3: implement the v2 SELECT/UPDATE that preserves display_name (unknown-column / coalesce semantics)
-- SELECT ...
-- FROM   ch5_user_profiles;
-- UPDATE ch5_user_profiles
-- SET    ...
-- WHERE  user_id = 1;
-- Verify Task 3: SELECT user_id, bio, display_name FROM ch5_user_profiles WHERE user_id = 1;
-- Expect: display_name still 'Alice T.' (or COALESCE-filled), not wiped
