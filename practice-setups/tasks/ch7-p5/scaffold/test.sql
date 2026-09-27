DO $$
DECLARE
  distributed_count integer;
  all_schema boolean;
  acme_colocations integer;
  acme_workers integer;
  globex_colocations integer;
  globex_workers integer;
  acme_colocation_id integer;
  globex_colocation_id integer;
BEGIN
  SELECT count(*), bool_and(citus_table_type = 'schema')
  INTO distributed_count, all_schema
  FROM citus_shards
  WHERE table_name::text LIKE 'acme.%' OR table_name::text LIKE 'globex.%';

  IF distributed_count <> 4 OR all_schema IS NOT TRUE THEN
    RAISE EXCEPTION 'expected four schema-distributed tables, found %', distributed_count;
  END IF;

  SELECT count(DISTINCT colocation_id), count(DISTINCT nodename), min(colocation_id)
  INTO acme_colocations, acme_workers, acme_colocation_id
  FROM citus_shards
  WHERE table_name::text LIKE 'acme.%';

  SELECT count(DISTINCT colocation_id), count(DISTINCT nodename), min(colocation_id)
  INTO globex_colocations, globex_workers, globex_colocation_id
  FROM citus_shards
  WHERE table_name::text LIKE 'globex.%';

  IF acme_colocations <> 1 OR acme_workers <> 1 THEN
    RAISE EXCEPTION 'acme tables are not colocated on one worker';
  END IF;

  IF globex_colocations <> 1 OR globex_workers <> 1 THEN
    RAISE EXCEPTION 'globex tables are not colocated on one worker';
  END IF;

  IF acme_colocation_id = globex_colocation_id THEN
    RAISE EXCEPTION 'tenant schemas must use distinct colocation IDs';
  END IF;
END
$$;

SELECT 'schema sharding checks passed' AS result;
