#!/bin/sh
set -eu

endpoint=http://etcd:2379
lock_key=/coordination/report-lock
resource_key=/coordination/report-result
lease_a=""
lease_b=""

cleanup() {
  [ -z "$lease_a" ] || etcdctl --endpoints="$endpoint" lease revoke "$lease_a" >/dev/null 2>&1 || true
  [ -z "$lease_b" ] || etcdctl --endpoints="$endpoint" lease revoke "$lease_b" >/dev/null 2>&1 || true
  etcdctl --endpoints="$endpoint" del --prefix /coordination/ >/dev/null 2>&1 || true
}
trap cleanup EXIT

attempt=0
until etcdctl --endpoints="$endpoint" endpoint health >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 1
done
etcdctl --endpoints="$endpoint" del --prefix /coordination/ >/dev/null

alpha_output="$(sh /work/acquire.sh alpha)"
printf '%s\n' "$alpha_output" | grep -q -x 'acquired=true'
lease_a="$(printf '%s\n' "$alpha_output" | sed -n 's/^lease=//p')"
token_a="$(printf '%s\n' "$alpha_output" | sed -n 's/^token=//p')"
[ -n "$lease_a" ]
[ "$token_a" -gt 0 ]

lock_json="$(etcdctl --endpoints="$endpoint" get "$lock_key" --write-out=json)"
printf '%s\n' "$lock_json" | python3 -c '
import json, sys
data = json.load(sys.stdin)["kvs"][0]
assert data["value"] == "YWxwaGE="
assert int(data["lease"]) != 0
assert int(data["create_revision"]) == int(sys.argv[1])
' "$token_a"

beta_attempt="$(sh /work/acquire.sh beta)"
printf '%s\n' "$beta_attempt" | grep -q -x 'acquired=false'
printf '%s\n' "$beta_attempt" | grep -q -x 'holder=alpha'
[ "$(etcdctl --endpoints="$endpoint" get "$lock_key" --print-value-only)" = alpha ]
leases_json="$(etcdctl --endpoints="$endpoint" lease list --write-out=json)"
printf '%s\n' "$leases_json" | python3 -c '
import json, sys
lease_ids = {int(lease["id"]) for lease in json.load(sys.stdin)["leases"]}
assert lease_ids == {int(sys.argv[1], 16)}
' "$lease_a"

alpha_write="$(sh /work/fenced-write.sh "$token_a" alpha-result)"
printf '%s\n' "$alpha_write" | grep -q -x 'accepted=true'
printf '%s\n' "$alpha_write" | grep -q -x 'value=alpha-result'

etcdctl --endpoints="$endpoint" lease revoke "$lease_a" >/dev/null
lease_a=""
[ -z "$(etcdctl --endpoints="$endpoint" get "$lock_key" --print-value-only)" ]

beta_output="$(sh /work/acquire.sh beta)"
printf '%s\n' "$beta_output" | grep -q -x 'acquired=true'
lease_b="$(printf '%s\n' "$beta_output" | sed -n 's/^lease=//p')"
token_b="$(printf '%s\n' "$beta_output" | sed -n 's/^token=//p')"
[ -n "$lease_b" ]
[ "$token_b" -gt "$token_a" ]

beta_write="$(sh /work/fenced-write.sh "$token_b" beta-result)"
printf '%s\n' "$beta_write" | grep -q -x 'accepted=true'
printf '%s\n' "$beta_write" | grep -q -x 'value=beta-result'

stale_write="$(sh /work/fenced-write.sh "$token_a" stale-result)"
printf '%s\n' "$stale_write" | grep -q -x 'accepted=false'
printf '%s\n' "$stale_write" | grep -q -x 'value=beta-result'
[ "$(etcdctl --endpoints="$endpoint" get "$resource_key" --print-value-only)" = beta-result ]

echo PASS
