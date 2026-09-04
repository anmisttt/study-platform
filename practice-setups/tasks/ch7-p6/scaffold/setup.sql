DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS plans CASCADE;

CREATE TABLE plans (
  plan_code text PRIMARY KEY
);
CREATE TABLE tenants (
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  plan_code text NOT NULL
);
CREATE TABLE projects (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL
);
CREATE TABLE tasks (
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL,
  project_id uuid NOT NULL,
  title text NOT NULL
);

-- TODO: replace this block with reference-table and distribution calls.
DO $$ BEGIN RAISE NOTICE 'distribution not implemented'; END $$;

-- TODO: replace this block with tenant-aware keys and foreign keys.
DO $$ BEGIN RAISE NOTICE 'constraints not implemented'; END $$;

INSERT INTO plans VALUES ('starter');
INSERT INTO tenants VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme', 'starter');
INSERT INTO projects VALUES
  ('00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'Launch');
INSERT INTO tasks VALUES
  ('00000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'Prepare rollout');

SELECT table_name, citus_table_type, distribution_column,
       colocation_id, shard_count
FROM citus_tables
WHERE table_name IN ('plans'::regclass, 'tenants'::regclass,
                     'projects'::regclass, 'tasks'::regclass)
ORDER BY table_name::text;

EXPLAIN (COSTS OFF)
SELECT p.name, count(t.task_id)
FROM projects p
LEFT JOIN tasks t
  ON (t.tenant_id, t.project_id) = (p.tenant_id, p.project_id)
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
GROUP BY p.tenant_id, p.project_id, p.name;
