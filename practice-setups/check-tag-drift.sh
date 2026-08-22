#!/usr/bin/env bash
# Fail CI if chapter JSON references a docker tag missing from docker-bake.hcl
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

refs=$(grep -rhoE 'ghcr\.io/anmisttt/ddia-practice:ch[0-9]+-p[0-9]+' backend/src/data \
  | sed 's/.*://' | sort -u)

missing=0
while IFS= read -r tag; do
  [[ -z "$tag" ]] && continue
  if ! grep -q "task-${tag}" practice-setups/docker-bake.hcl; then
    echo "missing bake target for tag: ${tag}" >&2
    missing=1
  fi
done <<< "$refs"

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi
count=$(echo "$refs" | grep -c . || true)
echo "drift check ok (${count} tags)"
