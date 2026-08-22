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

exec docker-entrypoint.sh "$@"
