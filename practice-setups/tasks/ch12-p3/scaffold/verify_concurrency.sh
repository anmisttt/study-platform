#!/usr/bin/env bash
set -euo pipefail

psql_args=(-X -qAt -v ON_ERROR_STOP=1 -U postgres -d ch12_cdc_lab)
tmpdir=$(mktemp -d)
first_pid=
second_pid=
cleanup() {
  [[ -z "$second_pid" ]] || kill "$second_pid" 2>/dev/null || true
  [[ -z "$first_pid" ]] || kill "$first_pid" 2>/dev/null || true
  rm -rf -- "$tmpdir"
}
trap cleanup EXIT

psql "${psql_args[@]}" <<'SQL'
TRUNCATE cdc.orders, cdc.orders_search, cdc.cdc_orders_changelog RESTART IDENTITY;
UPDATE cdc.cdc_consumer_offset
SET last_seq = 0
WHERE consumer_name = 'orders_search';
INSERT INTO cdc.cdc_orders_changelog (op, order_id)
VALUES
  ('delete', 401),
  ('delete', 402),
  ('delete', 403),
  ('delete', 404);
SQL

first_app="ch12_p3_first_$$"
second_app="ch12_p3_second_$$"

mkfifo "$tmpdir/first.in" "$tmpdir/first.out"
exec 3<>"$tmpdir/first.in" 4<>"$tmpdir/first.out"
env PGAPPNAME="$first_app" psql "${psql_args[@]}" <&3 >&4 &
first_pid=$!
printf 'BEGIN;\nSELECT cdc.apply_orders_cdc(100);\n\\echo ready\n' >&3
IFS= read -r -u 4 first_applied
IFS= read -r -u 4 first_state
[[ "$first_applied" == "4" && "$first_state" == "ready" ]]

env PGAPPNAME="$second_app" psql "${psql_args[@]}" \
  -c "SELECT cdc.apply_orders_cdc(2);" >"$tmpdir/second.out" &
second_pid=$!

blocked=0
for _ in {1..100}; do
  blocked=$(psql "${psql_args[@]}" \
    -v first_app="$first_app" -v second_app="$second_app" <<'SQL'
SELECT count(*)
FROM pg_stat_activity AS second_session
WHERE second_session.application_name = :'second_app'
  AND second_session.wait_event_type = 'Lock'
  AND EXISTS (
    SELECT 1
    FROM unnest(pg_blocking_pids(second_session.pid)) AS blocker(pid)
    JOIN pg_stat_activity AS first_session ON first_session.pid = blocker.pid
    WHERE first_session.application_name = :'first_app'
  );
SQL
  )
  [[ "$blocked" == "1" ]] && break
  sleep 0.05
done
[[ "$blocked" == "1" ]]

printf 'COMMIT;\n\\echo committed\n\\q\n' >&3
IFS= read -r -u 4 first_state
[[ "$first_state" == "committed" ]]
wait "$first_pid"
first_pid=
exec 3>&- 4>&-

wait "$second_pid"
second_pid=
second_applied=$(<"$tmpdir/second.out")
[[ "$second_applied" == "0" ]]

psql "${psql_args[@]}" <<'SQL'
DO $$
BEGIN
  ASSERT (
    SELECT last_seq
    FROM cdc.cdc_consumer_offset
    WHERE consumer_name = 'orders_search'
  ) = (SELECT max(seq) FROM cdc.cdc_orders_changelog);
  ASSERT cdc.apply_orders_cdc(100) = 0;
END;
$$;
SELECT 'checkpoint serialization verification passed';
SQL
