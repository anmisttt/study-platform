#!/usr/bin/env bash
# Build and smoke-test practice images through the shared Bake definition.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_OWNER="${IMAGE_OWNER:-anmisttt}"
TASK_PKG="${TASK_PKG:-lab}"
PLATFORM="${PLATFORM:-linux/$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')}"
export REGISTRY IMAGE_OWNER TASK_PKG

usage() {
  cat <<EOF
Usage:
  ./build.sh <tag>           Build one Docker-backed task, e.g. ch1-p1
  ./build.sh all             Build all configured practice images
  ./build.sh verify <tag>    Smoke-test a PostgreSQL task image

Environment:
  REGISTRY      default ghcr.io
  IMAGE_OWNER   default anmisttt
  PLATFORM      default native linux/arch
EOF
}

bake() {
  docker buildx bake --load --set "*.platform=${PLATFORM}" "$@"
}

build_task() {
  local tag="$1"
  if [[ ! -d "tasks/${tag}" ]]; then
    echo "unknown task: ${tag}" >&2
    exit 1
  fi
  bake "task-${tag}"
}

verify_task() {
  local tag="$1"
  local image="${REGISTRY}/${IMAGE_OWNER}/${TASK_PKG}:${tag}"
  local db
  db="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image" \
    | sed -n 's/^POSTGRES_DB=//p')"
  if [[ -z "$db" ]]; then
    echo "verify only supports PostgreSQL task images: ${tag}" >&2
    exit 1
  fi

  local cname="lab-verify-${tag}"
  docker rm -f "$cname" >/dev/null 2>&1 || true
  trap 'docker rm -f "$cname" >/dev/null 2>&1 || true' EXIT

  echo "==> smoke test ${image}"
  docker run -d --name "$cname" -p 5432 "$image" >/dev/null
  for _ in {1..30}; do
    if docker exec "$cname" pg_isready -U postgres -d "$db" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  docker exec "$cname" psql -U postgres -d "$db" -c 'SELECT 1' >/dev/null

  local endpoint host_port
  endpoint="$(docker port "$cname" 5432/tcp | sed -n '1p')"
  host_port="${endpoint##*:}"
  if command -v psql >/dev/null 2>&1; then
    psql -h 127.0.0.1 -p "$host_port" -U postgres -d "$db" -c 'SELECT 1' >/dev/null
  else
    docker run --rm --add-host host.docker.internal:host-gateway postgres:16-bookworm \
      psql -h host.docker.internal -p "$host_port" -U postgres -d "$db" -c 'SELECT 1' >/dev/null
  fi

  docker rm -f "$cname" >/dev/null
  trap - EXIT
  echo "ok: ${tag}"
}

case "${1:-}" in
  all)
    bake default
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
