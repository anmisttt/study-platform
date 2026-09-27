\set ON_ERROR_STOP on

DROP TRIGGER IF EXISTS ch5_capture_profile_updates ON ch5_user_profiles;
DROP FUNCTION IF EXISTS ch5_capture_profile_update();
DROP TABLE IF EXISTS ch5_profile_update_log;
DROP VIEW IF EXISTS ch5_user_profiles_v2;

UPDATE ch5_user_profiles
SET email = 'alice@example.com',
    bio = 'Platform engineer',
    display_name = 'Alice T.'
WHERE user_id = 1;

UPDATE ch5_user_profiles
SET email = 'bob@example.com',
    bio = 'SRE',
    display_name = NULL
WHERE user_id = 2;

CREATE TABLE ch5_profile_update_log (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  old_bio TEXT NOT NULL,
  new_bio TEXT NOT NULL,
  old_display_name TEXT,
  new_display_name TEXT
);

CREATE FUNCTION ch5_capture_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $capture$
BEGIN
  INSERT INTO ch5_profile_update_log (
    user_id,
    old_bio,
    new_bio,
    old_display_name,
    new_display_name
  ) VALUES (
    NEW.user_id,
    OLD.bio,
    NEW.bio,
    OLD.display_name,
    NEW.display_name
  );
  RETURN NEW;
END;
$capture$;

CREATE TRIGGER ch5_capture_profile_updates
AFTER UPDATE ON ch5_user_profiles
FOR EACH ROW
EXECUTE FUNCTION ch5_capture_profile_update();

\ir /work/ch5_user_profiles.sql

DROP TRIGGER ch5_capture_profile_updates ON ch5_user_profiles;
DROP FUNCTION ch5_capture_profile_update();

DO $verify$
DECLARE
  unsafe_event BIGINT;
  v1_event BIGINT;
  v2_event BIGINT;
BEGIN
  SELECT min(event_id) INTO unsafe_event
  FROM ch5_profile_update_log
  WHERE user_id = 1
    AND old_display_name = 'Alice T.'
    AND new_display_name IS NULL
    AND new_bio = 'Legacy whole-row edit';

  SELECT min(event_id) INTO v1_event
  FROM ch5_profile_update_log
  WHERE event_id > unsafe_event
    AND user_id = 1
    AND new_bio = 'Narrow v1 edit'
    AND old_display_name = 'Alice T.'
    AND new_display_name = 'Alice T.';

  SELECT min(event_id) INTO v2_event
  FROM ch5_profile_update_log
  WHERE event_id > v1_event
    AND user_id = 1
    AND new_bio = 'V2 profile edit'
    AND old_display_name = 'Alice T.'
    AND new_display_name = 'Alice T.';

  IF unsafe_event IS NULL OR v1_event IS NULL OR v2_event IS NULL THEN
    RAISE EXCEPTION 'The unsafe, narrow v1, and narrow v2 phases were not observed in order';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ch5_profile_update_log WHERE user_id = 2
  ) THEN
    RAISE EXCEPTION 'The untouched profile was updated';
  END IF;

  IF (SELECT count(*) FROM ch5_user_profiles_v2) <> 2
     OR NOT EXISTS (
       SELECT 1
       FROM ch5_user_profiles_v2
       WHERE user_id = 1
         AND email = 'alice@example.com'
         AND bio = 'V2 profile edit'
         AND effective_display_name = 'Alice T.'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM ch5_user_profiles_v2
       WHERE user_id = 2
         AND email = 'bob@example.com'
         AND bio = 'SRE'
         AND effective_display_name = 'bob@example.com'
     ) THEN
    RAISE EXCEPTION 'The v2 read does not expose every profile with the expected fallback';
  END IF;
END;
$verify$;

DROP TABLE ch5_profile_update_log;

SELECT 'verification passed' AS result;
