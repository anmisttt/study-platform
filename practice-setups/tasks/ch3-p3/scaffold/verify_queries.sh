#!/usr/bin/env bash
set -euo pipefail

pg_output="$(docker compose exec -T postgres psql -XAtF, -v ON_ERROR_STOP=1 -U postgres -d lab < postgres_compare.sql)"
expected_pg=$'logger,2.0.0,1\nwebserver,2.3.1,1\nrouter,1.4.0,2\nutils,1.1.0,2\ncrypto,4.2.0,3\nhttp-lib,3.1.0,3\nlogger,2.0.0,1\nmyapp,1.0.0,2\nwebserver,2.3.1,2'
test "$pg_output" = "$expected_pg"

orient_output="$(docker compose exec -T orientdb /orientdb/bin/console.sh /lab/orient_compare.osql)"
grep -q 'min_hops' <<<"$orient_output"
grep -q 'hops_from_utils' <<<"$orient_output"
for row in '1[[:space:]]*\|[[:space:]]*logger[[:space:]]*\|[[:space:]]*2\.0\.0' \
  '1[[:space:]]*\|[[:space:]]*webserver[[:space:]]*\|[[:space:]]*2\.3\.1' \
  '2[[:space:]]*\|[[:space:]]*router[[:space:]]*\|[[:space:]]*1\.4\.0' \
  '2[[:space:]]*\|[[:space:]]*utils[[:space:]]*\|[[:space:]]*1\.1\.0' \
  '3[[:space:]]*\|[[:space:]]*crypto[[:space:]]*\|[[:space:]]*4\.2\.0' \
  '3[[:space:]]*\|[[:space:]]*http-lib[[:space:]]*\|[[:space:]]*3\.1\.0' \
  '2[[:space:]]*\|[[:space:]]*myapp[[:space:]]*\|[[:space:]]*1\.0\.0' \
  '2[[:space:]]*\|[[:space:]]*webserver[[:space:]]*\|[[:space:]]*2\.3\.1'; do
  grep -Eq "$row" <<<"$orient_output"
done

echo 'All dependency traversal checks passed.'
