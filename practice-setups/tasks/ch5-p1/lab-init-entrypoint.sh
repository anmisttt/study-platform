#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "init" ]; then
  if [ -z "${2:-}" ]; then
    out="/out"
  else
    out="$2"
  fi
  mkdir -p "$out"
  cp -R /lab/scaffold/. "$out"/
  exit 0
fi

# Postgres images wrap startup in docker-entrypoint.sh; the python lab images
# have no such wrapper, so run the command directly there.
if command -v docker-entrypoint.sh >/dev/null 2>&1; then
  exec docker-entrypoint.sh "$@"
fi

exec "$@"
