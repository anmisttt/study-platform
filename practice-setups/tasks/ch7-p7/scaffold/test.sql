\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_can_login boolean;
  app_can_login boolean;
  app_is_superuser boolean;
  app_bypasses_rls boolean;
  app_can_create_role boolean;
  app_can_create_db boolean;
  app_can_replicate boolean;
  schema_owner name;
  table_owner name;
  sequence_owner name;
  identity_sequence text;
  seeded_projects text[];
  app_has_table_maintain boolean;
  app_policy_exists boolean;
BEGIN
  SELECT rolcanlogin
  INTO owner_can_login
  FROM pg_roles
  WHERE rolname = 'rls_lab_owner';

  IF owner_can_login IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'rls_lab_owner must exist with NOLOGIN';
  END IF;

  SELECT
    rolcanlogin,
    rolsuper,
    rolbypassrls,
    rolcreaterole,
    rolcreatedb,
    rolreplication
  INTO
    app_can_login,
    app_is_superuser,
    app_bypasses_rls,
    app_can_create_role,
    app_can_create_db,
    app_can_replicate
  FROM pg_roles
  WHERE rolname = 'rls_lab_app';

  IF app_can_login IS DISTINCT FROM true
     OR app_is_superuser IS DISTINCT FROM false
     OR app_bypasses_rls IS DISTINCT FROM false
     OR app_can_create_role IS DISTINCT FROM false
     OR app_can_create_db IS DISTINCT FROM false
     OR app_can_replicate IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'rls_lab_app has unsafe role attributes';
  END IF;

  IF pg_has_role('rls_lab_app', 'rls_lab_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'rls_lab_app must not be a member of rls_lab_owner';
  END IF;

  IF has_schema_privilege('rls_lab_app', 'rls_lab', 'CREATE') THEN
    RAISE EXCEPTION 'rls_lab_app must not have CREATE on schema rls_lab';
  END IF;

  IF NOT has_schema_privilege('rls_lab_app', 'rls_lab', 'USAGE')
     OR NOT has_table_privilege('rls_lab_app', 'rls_lab.projects', 'SELECT')
     OR NOT has_table_privilege('rls_lab_app', 'rls_lab.projects', 'INSERT')
     OR NOT has_table_privilege('rls_lab_app', 'rls_lab.projects', 'UPDATE')
     OR NOT has_table_privilege('rls_lab_app', 'rls_lab.projects', 'DELETE')
     OR has_table_privilege(
       'rls_lab_app',
       'rls_lab.projects',
       'TRUNCATE, REFERENCES, TRIGGER'
     ) THEN
    RAISE EXCEPTION 'rls_lab_app has incorrect schema or table privileges';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_class AS c
    CROSS JOIN LATERAL aclexplode(
      COALESCE(c.relacl, acldefault('r', c.relowner))
    ) AS privilege
    WHERE c.oid = 'rls_lab.projects'::regclass
      AND privilege.privilege_type = 'MAINTAIN'
      AND CASE
        WHEN privilege.grantee = 0 THEN true
        ELSE pg_has_role('rls_lab_app', privilege.grantee, 'USAGE')
      END
  )
  INTO app_has_table_maintain;

  IF app_has_table_maintain THEN
    RAISE EXCEPTION 'rls_lab_app must not have MAINTAIN on rls_lab.projects';
  END IF;

  identity_sequence := pg_get_serial_sequence('rls_lab.projects', 'id');
  IF identity_sequence IS DISTINCT FROM 'rls_lab.projects_id_seq'
     OR NOT has_sequence_privilege(
       'rls_lab_app',
       'rls_lab.projects_id_seq',
       'USAGE'
     )
     OR has_sequence_privilege(
       'rls_lab_app',
       'rls_lab.projects_id_seq',
       'SELECT'
     )
     OR has_sequence_privilege(
       'rls_lab_app',
       'rls_lab.projects_id_seq',
       'UPDATE'
     ) THEN
    RAISE EXCEPTION 'rls_lab_app has incorrect identity sequence privileges';
  END IF;

  SELECT pg_get_userbyid(nspowner)
  INTO schema_owner
  FROM pg_namespace
  WHERE nspname = 'rls_lab';

  SELECT pg_get_userbyid(relowner)
  INTO table_owner
  FROM pg_class
  WHERE oid = 'rls_lab.projects'::regclass;

  SELECT pg_get_userbyid(relowner)
  INTO sequence_owner
  FROM pg_class
  WHERE oid = 'rls_lab.projects_id_seq'::regclass;

  IF schema_owner IS DISTINCT FROM 'rls_lab_owner'
     OR table_owner IS DISTINCT FROM 'rls_lab_owner'
     OR sequence_owner IS DISTINCT FROM 'rls_lab_owner'
     OR schema_owner = 'rls_lab_app'
     OR table_owner = 'rls_lab_app'
     OR sequence_owner = 'rls_lab_app' THEN
    RAISE EXCEPTION 'rls_lab objects must be owned only by rls_lab_owner';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'rls_lab.projects'::regclass
      AND polroles = ARRAY[
        (SELECT oid FROM pg_roles WHERE rolname = 'rls_lab_app')
      ]::oid[]
      AND polqual IS NOT NULL
      AND polwithcheck IS NOT NULL
  )
  INTO app_policy_exists;

  IF NOT app_policy_exists THEN
    RAISE EXCEPTION 'rls_lab.projects needs a complete policy for only rls_lab_app';
  END IF;

  SELECT array_agg(tenant_id::text || '|' || name ORDER BY tenant_id, name)
  INTO seeded_projects
  FROM rls_lab.projects;

  IF seeded_projects IS DISTINCT FROM ARRAY[
    '11111111-1111-1111-1111-111111111111|Alpha project',
    '22222222-2222-2222-2222-222222222222|Beta project'
  ]::text[] THEN
    RAISE EXCEPTION 'unexpected seed projects: %', seeded_projects;
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE rls_lab_app;
SELECT set_config('app.tenant_id', '', true);

DO $$
DECLARE
  visible_count bigint;
BEGIN
  SELECT count(*)
  INTO visible_count
  FROM rls_lab.projects;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'application role saw % projects without tenant context', visible_count;
  END IF;
END
$$;

ROLLBACK;

BEGIN;
SET LOCAL ROLE rls_lab_app;
SELECT set_config(
  'app.tenant_id',
  '22222222-2222-2222-2222-222222222222',
  true
);

DO $$
DECLARE
  visible_projects text[];
BEGIN
  SELECT array_agg(name ORDER BY name)
  INTO visible_projects
  FROM rls_lab.projects;

  IF visible_projects IS DISTINCT FROM ARRAY['Beta project']::text[] THEN
    RAISE EXCEPTION 'unexpected tenant B projects: %', visible_projects;
  END IF;
END
$$;

ROLLBACK;

BEGIN;
SET LOCAL ROLE rls_lab_owner;

DO $$
DECLARE
  visible_count bigint;
BEGIN
  SELECT count(*)
  INTO visible_count
  FROM rls_lab.projects;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'forced table owner saw % projects without a policy', visible_count;
  END IF;
END
$$;

ROLLBACK;

BEGIN;
SET LOCAL ROLE rls_lab_app;
SELECT set_config(
  'app.tenant_id',
  '11111111-1111-1111-1111-111111111111',
  true
);

DO $$
DECLARE
  visible_projects text[];
  failure_message text;
BEGIN
  SELECT array_agg(name ORDER BY name)
  INTO visible_projects
  FROM rls_lab.projects;

  IF visible_projects IS DISTINCT FROM ARRAY['Alpha project']::text[] THEN
    RAISE EXCEPTION 'unexpected tenant A projects: %', visible_projects;
  END IF;

  BEGIN
    INSERT INTO rls_lab.projects (tenant_id, name)
    VALUES (
      '22222222-2222-2222-2222-222222222222',
      'Cross-tenant project'
    );
    RAISE EXCEPTION 'cross-tenant insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
      IF failure_message NOT LIKE '%row-level security policy%' THEN
        RAISE;
      END IF;
  END;
END
$$;

COMMIT;

BEGIN;
SET LOCAL ROLE rls_lab_app;

DO $$
DECLARE
  visible_count bigint;
BEGIN
  SELECT count(*)
  INTO visible_count
  FROM rls_lab.projects;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'transaction-local tenant context persisted after commit';
  END IF;
END
$$;

ROLLBACK;

BEGIN;
SET LOCAL ROLE rls_lab_app;
SELECT set_config(
  'app.tenant_id',
  '11111111-1111-1111-1111-111111111111',
  true
);

DO $$
DECLARE
  affected_rows bigint;
BEGIN
  UPDATE rls_lab.projects
  SET name = 'Alpha project updated'
  WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
    AND name = 'Alpha project';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'tenant A update affected % rows', affected_rows;
  END IF;

  DELETE FROM rls_lab.projects
  WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
    AND name = 'Alpha project updated';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'tenant A delete affected % rows', affected_rows;
  END IF;
END
$$;

ROLLBACK;
\echo 'RLS checks passed'
