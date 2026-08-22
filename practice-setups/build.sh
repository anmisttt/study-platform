#!/usr/bin/env bash
# Build practice lab images locally under the same tags published to GHCR.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

REGISTRY="${REGISTRY:-ghcr.io/anmisttt}"
TASK_PKG="${TASK_PKG:-ddia-practice}"
BASE_PKG="${BASE_PKG:-ddia-practice-base}"
PLATFORM="${PLATFORM:-linux/$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')}"

usage() {
  cat <<EOF
Usage:
  ./build.sh base [pg16|...]     Build a base image (loads locally)
  ./build.sh <tag>               Build one task, e.g. ch1-p0
  ./build.sh all                 Build pg16 base then every task in manifest.json
  ./build.sh verify <tag>        Start container and run a smoke check

Environment:
  REGISTRY   default ghcr.io/anmisttt
  PLATFORM   default native linux/arch
EOF
}

build_base() {
  local name="${1:-pg16}"
  local tag="${REGISTRY}/${BASE_PKG}:${name}"
  echo "==> building base ${tag}"
  docker build \
    --platform "${PLATFORM}" \
    -t "${tag}" \
    -f "bases/${name}/Dockerfile" \
    "bases/${name}"
}

build_task() {
  local task_tag="$1"
  local dir="tasks/${task_tag}"
  if [[ ! -d "${dir}" ]]; then
    echo "unknown task: ${task_tag} (missing ${dir})" >&2
    exit 1
  fi
  local base
  base="$(python3 -c "import json; m=json.load(open('manifest.json')); print(m['tasks']['${task_tag}']['base'])")"
  build_base "${base}"
  local image="${REGISTRY}/${TASK_PKG}:${task_tag}"
  echo "==> building task ${image}"
  docker build \
    --platform "${PLATFORM}" \
    --build-arg "BASE_IMAGE=${REGISTRY}/${BASE_PKG}:${base}" \
    -t "${image}" \
    -f "${dir}/Dockerfile" \
    "${dir}"
}

verify_task() {
  local task_tag="$1"
  local image="${REGISTRY}/${TASK_PKG}:${task_tag}"
  local meta
  meta="$(python3 -c "import json; t=json.load(open('manifest.json'))['tasks']['${task_tag}']; print(t.get('db',''), t.get('port',''))")"
  read -r db port <<< "${meta}"
  local cname="lab-verify-${task_tag}"
  docker rm -f "${cname}" >/dev/null 2>&1 || true
  echo "==> smoke test ${image}"
  docker run -d --name "${cname}" -p "${port}:${port}" "${image}" >/dev/null
  sleep 3
  if [[ -n "${db}" ]]; then
    docker exec "${cname}" psql -U postgres -d "${db}" -c 'SELECT 1' >/dev/null
  fi
  docker rm -f "${cname}" >/dev/null
  echo "ok: ${task_tag}"
}

case "${1:-}" in
  base)
    build_base "${2:-pg16}"
    ;;
  all)
    build_base pg16
    while IFS= read -r t; do
      build_task "$t"
    done < <(python3 -c "import json; print('\n'.join(json.load(open('manifest.json'))['tasks']))")
    ;;
  verify)
    verify_task "${2:?tag required}"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    build_task "$1"
    ;;
esac
