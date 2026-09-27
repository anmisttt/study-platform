DO $$
DECLARE
  reference_tables integer;
  distributed_tables integer;
  tenant_distribution_columns integer;
  colocation_groups integer;
  minimum_shards integer;
  maximum_shards integer;
  tenant_primary_keys integer;
  exact_tenant_primary_keys integer;
  tenant_foreign_keys integer;
  exact_tenant_foreign_keys integer;
  project_name text;
  joined_tasks bigint;
  plan_line text;
  single_task_plan boolean := false;
BEGIN
  SELECT
    count(*) FILTER (
      WHERE table_name::text = 'plans' AND citus_table_type = 'reference'
    ),
    count(*) FILTER (
      WHERE table_name::text IN ('tenants', 'projects', 'tasks')
        AND citus_table_type = 'distributed'
    ),
    count(*) FILTER (
      WHERE table_name::text IN ('tenants', 'projects', 'tasks')
        AND distribution_column = 'tenant_id'
    )
  INTO reference_tables, distributed_tables, tenant_distribution_columns
  FROM citus_tables
  WHERE table_name::text IN ('plans', 'tenants', 'projects', 'tasks');

  IF reference_tables <> 1
     OR distributed_tables <> 3
     OR tenant_distribution_columns <> 3 THEN
    RAISE EXCEPTION 'reference or distributed table metadata is incorrect';
  END IF;

  SELECT count(DISTINCT colocation_id), min(shard_count), max(shard_count)
  INTO colocation_groups, minimum_shards, maximum_shards
  FROM citus_tables
  WHERE table_name::text IN ('tenants', 'projects', 'tasks');

  IF colocation_groups <> 1 OR minimum_shards <> 8 OR maximum_shards <> 8 THEN
    RAISE EXCEPTION 'tenant tables must be colocated with eight shards each';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE (tenant_table.relname, key_columns) IN (
        ('tenants', ARRAY['tenant_id']),
        ('projects', ARRAY['tenant_id', 'project_id']),
        ('tasks', ARRAY['tenant_id', 'task_id'])
      )
    )
  INTO tenant_primary_keys, exact_tenant_primary_keys
  FROM (
    SELECT c.conrelid,
           ARRAY(
             SELECT a.attname::text
             FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, position)
             JOIN pg_attribute a
               ON a.attrelid = c.conrelid AND a.attnum = k.attnum
             ORDER BY k.position
           ) AS key_columns
    FROM pg_constraint c
    WHERE c.contype = 'p'
  ) AS primary_keys
  JOIN pg_class tenant_table ON tenant_table.oid = primary_keys.conrelid
  JOIN pg_namespace tenant_schema ON tenant_schema.oid = tenant_table.relnamespace
  WHERE tenant_schema.nspname = 'public'
    AND tenant_table.relname IN ('tenants', 'projects', 'tasks');

  IF tenant_primary_keys <> 3 OR exact_tenant_primary_keys <> 3 THEN
    RAISE EXCEPTION 'tenant table primary keys do not match the required ordered columns';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE (child.relname, parent.relname, child_columns, parent_columns) IN (
        ('tenants', 'plans', ARRAY['plan_code'], ARRAY['plan_code']),
        ('projects', 'tenants', ARRAY['tenant_id'], ARRAY['tenant_id']),
        ('tasks', 'projects', ARRAY['tenant_id', 'project_id'],
                              ARRAY['tenant_id', 'project_id'])
      )
    )
  INTO tenant_foreign_keys, exact_tenant_foreign_keys
  FROM (
    SELECT c.conrelid, c.confrelid,
           ARRAY(
             SELECT a.attname::text
             FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, position)
             JOIN pg_attribute a
               ON a.attrelid = c.conrelid AND a.attnum = k.attnum
             ORDER BY k.position
           ) AS child_columns,
           ARRAY(
             SELECT a.attname::text
             FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, position)
             JOIN pg_attribute a
               ON a.attrelid = c.confrelid AND a.attnum = k.attnum
             ORDER BY k.position
           ) AS parent_columns
    FROM pg_constraint c
    WHERE c.contype = 'f'
  ) AS foreign_keys
  JOIN pg_class child ON child.oid = foreign_keys.conrelid
  JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
  JOIN pg_class parent ON parent.oid = foreign_keys.confrelid
  JOIN pg_namespace parent_schema ON parent_schema.oid = parent.relnamespace
  WHERE child_schema.nspname = 'public'
    AND parent_schema.nspname = 'public'
    AND child.relname IN ('tenants', 'projects', 'tasks');

  IF tenant_foreign_keys <> 3 OR exact_tenant_foreign_keys <> 3 THEN
    RAISE EXCEPTION 'tenant table foreign keys do not match the required relationships';
  END IF;

  SELECT p.name, count(t.task_id)
  INTO project_name, joined_tasks
  FROM projects p
  LEFT JOIN tasks t
    ON (t.tenant_id, t.project_id) = (p.tenant_id, p.project_id)
  WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  GROUP BY p.tenant_id, p.project_id, p.name;

  IF project_name IS DISTINCT FROM 'Launch' OR joined_tasks <> 1 THEN
    RAISE EXCEPTION 'the tenant join returned an unexpected result';
  END IF;

  FOR plan_line IN EXECUTE $query$
    EXPLAIN (ANALYZE, COSTS OFF)
    SELECT p.name, count(t.task_id)
    FROM projects p
    LEFT JOIN tasks t
      ON (t.tenant_id, t.project_id) = (p.tenant_id, p.project_id)
    WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
    GROUP BY p.tenant_id, p.project_id, p.name
  $query$
  LOOP
    single_task_plan := single_task_plan OR plan_line LIKE '%Task Count: 1%';
  END LOOP;

  IF NOT single_task_plan THEN
    RAISE EXCEPTION 'the executed tenant join did not use one Citus task';
  END IF;

  RAISE NOTICE 'verification=passed';
END
$$;
