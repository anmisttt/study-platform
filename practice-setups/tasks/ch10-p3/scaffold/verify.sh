#!/usr/bin/env bash
set -euo pipefail

services=(etcd1 etcd2 etcd3)
endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379

json_number() {
  printf '%s\n' "$1" | sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p"
}

docker compose exec -T etcd1 etcdctl \
  --endpoints="$endpoints" endpoint health >/dev/null

revisions=()
for key in 0001 0002 0003; do
  result="$(docker compose exec -T etcd1 etcdctl \
    --endpoints="$endpoints" get "/events/$key" --write-out=json)"
  revision="$(json_number "$result" mod_revision)"
  [[ -n "$revision" ]]
  revisions+=("$revision")
done
[[ "${revisions[0]}" -lt "${revisions[1]}" ]]
[[ "${revisions[1]}" -lt "${revisions[2]}" ]]

for service in "${services[@]}"; do
  for pair in 0001:W1 0002:W2 0003:W3; do
    key="${pair%%:*}"
    expected="${pair#*:}"
    actual="$(docker compose exec -T "$service" etcdctl \
      --endpoints="http://$service:2379" --consistency=s \
      get "/events/$key" --print-value-only)"
    [[ "$actual" = "$expected" ]]
  done
done

rejected="$(docker compose exec -T etcd1 etcdctl \
  --endpoints="$endpoints" get /events/no-quorum --print-value-only)"
[[ -z "$rejected" ]]

printf 'write_revisions=%s,%s,%s\n' "${revisions[@]}"
echo PASS
