#!/usr/bin/env bash
set -euo pipefail

services=(etcd1 etcd2 etcd3)
containers=(lab-ch10-p2-etcd1 lab-ch10-p2-etcd2 lab-ch10-p2-etcd3)
key="consensus/value"
network=""
leader_container=""
isolated=0

reconnect_leader() {
  if [[ "$isolated" = 1 ]]; then
    docker network connect --alias "$leader" "$network" "$leader_container" >/dev/null 2>&1 || true
  fi
}
trap reconnect_leader EXIT

member_status() {
  docker compose exec -T "$1" \
    etcdctl --endpoints=http://127.0.0.1:2379 endpoint status --write-out=json
}

wait_for_cluster() {
  local attempt service value
  for attempt in {1..30}; do
    for service in "${services[@]}"; do
      value="$(docker compose exec -T "$service" \
        etcdctl --endpoints=http://127.0.0.1:2379 get "$key" \
        --consistency=s --print-value-only 2>/dev/null || true)"
      [[ "$value" = "$1" ]] || break
    done
    [[ "$value" = "$1" ]] && return 0
    sleep 1
  done
  return 1
}

for service in "${services[@]}"; do
  docker compose exec -T "$service" \
    etcdctl --endpoints=http://127.0.0.1:2379 endpoint health >/dev/null
done

docker compose exec -T etcd1 \
  etcdctl --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  put "$key" baseline >/dev/null

echo "=== before isolation ==="
docker compose exec -T etcd1 \
  etcdctl --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  endpoint status --write-out=table

leader=""
for service in "${services[@]}"; do
  status="$(member_status "$service")"
  member_id="$(printf '%s\n' "$status" | sed -E 's/.*"member_id":([0-9]+).*/\1/')"
  leader_id="$(printf '%s\n' "$status" | sed -E 's/.*"leader":([0-9]+).*/\1/')"
  if [[ "$member_id" = "$leader_id" ]]; then
    leader="$service"
    break
  fi
done
[[ -n "$leader" ]] || { echo "could not identify the current leader" >&2; exit 1; }

majority=()
for service in "${services[@]}"; do
  [[ "$service" = "$leader" ]] || majority+=("$service")
done
case "$leader" in
  etcd1) leader_container="${containers[0]}" ;;
  etcd2) leader_container="${containers[1]}" ;;
  etcd3) leader_container="${containers[2]}" ;;
esac
network="$(docker inspect -f '{{range $name, $settings := .NetworkSettings.Networks}}{{$name}}{{end}}' "$leader_container")"

echo "leader_service=$leader"
docker network disconnect "$network" "$leader_container"
isolated=1
sleep 4

set +e
minority_output="$(docker compose exec -T "$leader" \
  etcdctl --endpoints=http://127.0.0.1:2379 \
  --dial-timeout=2s --command-timeout=2s put "$key" isolated-minority 2>&1)"
minority_rc=$?
set -e
[[ "$minority_rc" -ne 0 ]] || { echo "isolated former leader committed a write" >&2; exit 1; }
echo "former_leader_write=REJECTED"
printf '%s\n' "$minority_output"

majority_output="$(printf 'value(\"%s\") = \"baseline\"\n\nput %s majority-committed\n\nget %s\n\n' \
  "$key" "$key" "$key" | docker compose exec -T "${majority[0]}" \
  etcdctl --endpoints="http://${majority[0]}:2379,http://${majority[1]}:2379" \
  --command-timeout=8s txn)"
printf '%s\n' "$majority_output" | grep -Fxq SUCCESS
echo "connected_majority_txn=SUCCESS"
printf '%s\n' "$majority_output"

docker network connect --alias "$leader" "$network" "$leader_container"
isolated=0
wait_for_cluster majority-committed

echo "=== after recovery ==="
docker compose exec -T etcd1 \
  etcdctl --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  endpoint status --write-out=table
for service in "${services[@]}"; do
  value="$(docker compose exec -T "$service" \
    etcdctl --endpoints=http://127.0.0.1:2379 get "$key" \
    --consistency=s --print-value-only)"
  printf 'replica_value[%s]=%s\n' "$service" "$value"
  [[ "$value" = majority-committed ]]
done

echo "consensus verification passed"
