#!/usr/bin/env bash
set -euo pipefail

services=(etcd1 etcd2 etcd3)
stopped=""

restore_member() {
  if [[ -n "$stopped" ]]; then
    docker compose start "$stopped" >/dev/null 2>&1 || true
  fi
}
trap restore_member EXIT

status() {
  docker compose exec -T "$1" etcdctl \
    --endpoints="http://$1:2379" endpoint status --write-out=json 2>/dev/null
}

json_number() {
  printf '%s\n' "$1" | sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p"
}

leader_service() {
  local service row member_id leader_id
  for service in "${services[@]}"; do
    row="$(status "$service" || true)"
    [[ -n "$row" ]] || continue
    member_id="$(json_number "$row" member_id)"
    leader_id="$(json_number "$row" leader)"
    if [[ -n "$member_id" && "$member_id" = "$leader_id" ]]; then
      printf '%s\n' "$service"
      return 0
    fi
  done
  return 1
}

leader="$(leader_service)"
before="$(status "$leader")"
leader_id="$(json_number "$before" leader)"
old_term="$(json_number "$before" raftTerm)"
[[ "$(docker compose exec -T "$leader" etcdctl --endpoints="http://$leader:2379" get /events/0001 --print-value-only)" = W1 ]]
[[ "$(docker compose exec -T "$leader" etcdctl --endpoints="http://$leader:2379" get /events/0002 --print-value-only)" = W2 ]]

survivors=()
for service in "${services[@]}"; do
  [[ "$service" = "$leader" ]] || survivors+=("$service")
done

docker compose exec -T "$leader" etcdctl \
  --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  endpoint status --write-out=table
docker compose stop "$leader" >/dev/null
stopped="$leader"

replacement=""
replacement_term=""
for attempt in {1..30}; do
  for service in "${survivors[@]}"; do
    row="$(status "$service" || true)"
    [[ -n "$row" ]] || continue
    member_id="$(json_number "$row" member_id)"
    candidate="$(json_number "$row" leader)"
    term="$(json_number "$row" raftTerm)"
    if [[ -n "$candidate" && "$candidate" != "$leader_id" && "$term" -gt "$old_term" && "$member_id" = "$candidate" ]]; then
      replacement="$service"
      replacement_term="$term"
      break 2
    fi
  done
  sleep 1
done
[[ -n "$replacement" ]]

docker compose exec -T "$replacement" etcdctl \
  --endpoints="http://$replacement:2379" put /events/0003 W3 --write-out=json
docker compose start "$leader" >/dev/null
stopped=""

for attempt in {1..30}; do
  restarted="$(status "$leader" || true)"
  current="$(status "$replacement" || true)"
  restarted_applied="$(json_number "$restarted" raftAppliedIndex)"
  current_applied="$(json_number "$current" raftAppliedIndex)"
  if [[ -n "$restarted_applied" && -n "$current_applied" && "$restarted_applied" -ge "$current_applied" ]]; then
    break
  fi
  sleep 1
done
[[ -n "${restarted_applied:-}" && -n "${current_applied:-}" && "$restarted_applied" -ge "$current_applied" ]]

for service in "${services[@]}"; do
  [[ "$(docker compose exec -T "$service" etcdctl --endpoints="http://$service:2379" --consistency=s get /events/0001 --print-value-only)" = W1 ]]
  [[ "$(docker compose exec -T "$service" etcdctl --endpoints="http://$service:2379" --consistency=s get /events/0002 --print-value-only)" = W2 ]]
  [[ "$(docker compose exec -T "$service" etcdctl --endpoints="http://$service:2379" --consistency=s get /events/0003 --print-value-only)" = W3 ]]
done

docker compose exec -T "$replacement" etcdctl \
  --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  endpoint status --write-out=table
printf 'initial_leader=%s initial_term=%s\n' "$leader" "$old_term"
printf 'replacement_leader=%s replacement_term=%s\n' "$replacement" "$replacement_term"
echo PASS
