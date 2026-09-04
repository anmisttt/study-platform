-- ch8_lost_updates.sql — edit sites for the three tasks. Complete each stub
-- before pasting it into a live session; the 'home' row is already seeded.

-- Reset (run before each task):
-- UPDATE page_views SET view_count = 0, version = 0 WHERE page_id = 'home';

-- Session template: interactive RMW increment (Task 1)
-- TODO: interactive RMW that loses an update — SELECT view_count, then
-- UPDATE with the computed value (do NOT use view_count = view_count + 1 here)
BEGIN;
SELECT view_count FROM page_views WHERE page_id = 'home';
-- pause: wait for the other session before writing
-- UPDATE page_views SET view_count = <read_value + 1> WHERE page_id = 'home';
COMMIT;

-- Stub: atomic increment (Task 2)
-- implement atomic increment
-- UPDATE page_views SET view_count = ... WHERE page_id = 'home';

-- Stub: compare-and-set on version (Task 3)
-- implement CAS on version
SELECT view_count, version FROM page_views WHERE page_id = 'home';
-- ... application logic would run here ...
-- UPDATE page_views
-- SET view_count = <new_count>, version = <new_version>
-- WHERE page_id = 'home' AND version = <version_you_read>;
-- Check rows affected: 1 = success, 0 = conflict (retry)
