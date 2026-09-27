#!/usr/bin/env bash
set -euo pipefail

install -d -m 0700 -o postgres -g postgres "$PGDATA"
chmod 0700 "$PGDATA"

if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
  find "$PGDATA" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  until gosu postgres pg_basebackup \
    -h primary \
    -U replicator \
    -D "$PGDATA" \
    -Fp \
    -Xs \
    -R
  do
    sleep 1
  done
fi

chmod 0700 "$PGDATA"
exec gosu postgres postgres -D "$PGDATA" -c hot_standby=on
