#!/usr/bin/env bash
# Keep chapter image references, Bake entries, and task directories in sync.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

refs="$(grep -rhoE 'ghcr\.io/anmisttt/ddia-practice:ch[0-9]+-p[0-9]+' backend/src/data \
  | sed 's/.*://' | sort -u)"
configured="$(sed -nE 's/.*tag = "(ch[0-9]+-p[0-9]+)".*/\1/p' \
  practice-setups/docker-bake.hcl | sort -u)"
directories="$(find practice-setups/tasks -mindepth 1 -maxdepth 1 -type d \
  -exec basename {} \; | sort -u)"

if [[ "$refs" != "$configured" || "$refs" != "$directories" ]]; then
  echo "practice image tags are out of sync" >&2
  diff -u <(printf '%s\n' "$refs") <(printf '%s\n' "$configured") >&2 || true
  diff -u <(printf '%s\n' "$refs") <(printf '%s\n' "$directories") >&2 || true
  exit 1
fi

count="$(printf '%s\n' "$refs" | grep -c . || true)"
echo "drift check ok (${count} tags)"
