DROP MATERIALIZED VIEW IF EXISTS teams_without_admins;
DROP TRIGGER IF EXISTS team_admin_coverage_check ON team_members;
DROP FUNCTION IF EXISTS check_team_admin_coverage();

-- implement: last-admin trigger function
-- implement: UPDATE and DELETE triggers
-- implement: teams_without_admins materialized view
