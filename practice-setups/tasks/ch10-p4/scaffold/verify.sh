#!/bin/sh
set -eu

endpoint=http://etcd:2379
key=/claims/alex

attempt=0
until etcdctl --endpoints="$endpoint" endpoint health >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 1
done

etcdctl --endpoints="$endpoint" put "$key" participant-existing >/dev/null
before="$(etcdctl --endpoints="$endpoint" get "$key" --write-out=json)"
sh /work/claim.sh alex participant-new >/tmp/claim-seeded.out
after="$(etcdctl --endpoints="$endpoint" get "$key" --write-out=json)"
[ "$before" = "$after" ]
[ "$(cat /tmp/claim-seeded.out)" = "$(printf 'transaction=FAILURE\nlearned=participant-existing')" ]

etcdctl --endpoints="$endpoint" del "$key" >/dev/null
rm -f /tmp/claim-a.out /tmp/claim-b.out /tmp/claim-seeded.out

sh /work/claim.sh alex participant-a >/tmp/claim-a.out &
pid_a=$!
sh /work/claim.sh alex participant-b >/tmp/claim-b.out &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

winner="$(etcdctl --endpoints="$endpoint" get "$key" --print-value-only)"
case "$winner" in
  participant-a|participant-b) ;;
  *) exit 1 ;;
esac

success_count="$(grep -h -x 'transaction=SUCCESS' /tmp/claim-a.out /tmp/claim-b.out | wc -l | tr -d ' ')"
failure_count="$(grep -h -x 'transaction=FAILURE' /tmp/claim-a.out /tmp/claim-b.out | wc -l | tr -d ' ')"
[ "$success_count" -eq 1 ]
[ "$failure_count" -eq 1 ]
[ "$(wc -l </tmp/claim-a.out)" -eq 2 ]
[ "$(wc -l </tmp/claim-b.out)" -eq 2 ]
grep -q -x "learned=$winner" /tmp/claim-a.out
grep -q -x "learned=$winner" /tmp/claim-b.out
echo PASS
