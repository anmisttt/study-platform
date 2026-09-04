#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "init" ]; then
  if [ -z "${2:-}" ]; then
    out="/out"
  else
    out="$2"
  fi
  mkdir -p "$out"

  # A root container writing through a bind mount creates uid-0 files on a
  # Linux host. Remember the mount owner's numeric IDs before copying so the
  # generated scaffold remains editable by the host user.
  owner=""
  if [ "$(id -u)" = 0 ]; then
    owner="$(stat -c '%u:%g' "$out")"
  fi

  cp -R /lab/scaffold/. "$out"/

  # Change only paths that exist in the scaffold. A recursive chown of each
  # top-level destination could also modify unrelated files in an existing
  # directory with the same name.
  if [ -n "$owner" ]; then
    while IFS= read -r -d '' source; do
      relative="${source#/lab/scaffold/}"
      chown -h "$owner" "$out/$relative"
    done < <(find /lab/scaffold -mindepth 1 -print0)
  fi
  exit 0
fi

# Postgres images wrap startup in docker-entrypoint.sh; the python lab images
# have no such wrapper, so run the command directly there.
if command -v docker-entrypoint.sh >/dev/null 2>&1; then
  exec docker-entrypoint.sh "$@"
fi

exec "$@"
