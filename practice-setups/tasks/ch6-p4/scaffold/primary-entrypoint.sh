#!/usr/bin/env bash
set -euo pipefail

printf '\nhost replication replicator all trust\n' >>"$PGDATA/pg_hba.conf"

exec /usr/local/bin/lab-entrypoint.sh postgres \
  -c wal_level=replica \
  -c max_wal_senders=10 \
  -c hot_standby=on
