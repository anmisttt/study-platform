#!/usr/bin/env bash
set -euo pipefail

PRIMARY_URL="postgresql://postgres@primary:5432/lab"
STANDBY_URL="postgresql://postgres@standby:5432/lab"
ROUTER="./profile_router.sh"

resume_replay() {
  psql "$STANDBY_URL" -v ON_ERROR_STOP=1 -qAtc \
    "SELECT pg_wal_replay_resume()" >/dev/null 2>&1 || true
}
trap resume_replay EXIT

wait_for_replay() {
  local target="$1"
  local caught_up
  for _ in {1..100}; do
    caught_up="$(psql "$STANDBY_URL" -v target="$target" -qAt <<'SQL'
SELECT pg_last_wal_replay_lsn() >= :'target'::pg_lsn;
SQL
)"
    if [[ "$caught_up" == "t" ]]; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  [[ "$actual" == "$expected" ]] || {
    printf 'expected %q, got %q\n' "$expected" "$actual" >&2
    exit 1
  }
}

resume_replay
psql "$PRIMARY_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
TRUNCATE last_write;
UPDATE profiles
SET bio = CASE user_id
  WHEN 101 THEN 'Engineer'
  WHEN 202 THEN 'Designer'
END
WHERE user_id IN (101, 202);
SQL
baseline_lsn="$(psql "$PRIMARY_URL" -qAtc "SELECT pg_current_wal_lsn()")"
wait_for_replay "$baseline_lsn"

psql "$STANDBY_URL" -v ON_ERROR_STOP=1 -qAtc \
  "SELECT pg_wal_replay_pause()" >/dev/null
for _ in {1..50}; do
  [[ "$(psql "$STANDBY_URL" -qAtc \
    "SELECT pg_get_wal_replay_pause_state()")" == "paused" ]] && break
  sleep 0.1
done

write_start_lsn="$(psql "$PRIMARY_URL" -qAtc \
  "SELECT pg_current_wal_insert_lsn()")"
"$ROUTER" write 101 "Staff engineer"
assert_eq "true|true" "$(psql "$PRIMARY_URL" -v start_lsn="$write_start_lsn" -qAt <<'SQL'
SELECT (p.xmin = lw.xmin)::text || '|' ||
       (lw.write_lsn > :'start_lsn'::pg_lsn)::text
FROM profiles AS p
JOIN last_write AS lw USING (user_id)
WHERE p.user_id = 101;
SQL
)"
assert_eq "primary|101|Staff engineer" "$("$ROUTER" read 101)"
assert_eq "standby|202|Designer" "$("$ROUTER" read 202)"
assert_eq "standby|202|Designer" "$("$ROUTER" wait-read 202)"

if "$ROUTER" write 999 "Missing user" >/dev/null 2>&1; then
  echo "missing-user write unexpectedly succeeded" >&2
  exit 1
fi
if "$ROUTER" wait-read 999 >/dev/null 2>&1; then
  echo "missing-user wait-read unexpectedly succeeded" >&2
  exit 1
fi

psql "$PRIMARY_URL" -v ON_ERROR_STOP=1 -qAtc \
  "UPDATE last_write SET written_at = clock_timestamp() - interval '61 seconds' WHERE user_id = 101" \
  >/dev/null
assert_eq "standby|101|Engineer" "$("$ROUTER" read 101)"
assert_eq "primary|101|Staff engineer" "$("$ROUTER" wait-read 101)"
if "$ROUTER" read 999 >/dev/null 2>&1; then
  echo "missing-user read unexpectedly succeeded" >&2
  exit 1
fi

resume_replay
assert_eq "standby|101|Staff engineer" "$("$ROUTER" wait-read 101)"
assert_eq "f" "$(psql "$PRIMARY_URL" -qAtc "SELECT pg_is_in_recovery()")"
assert_eq "t" "$(psql "$STANDBY_URL" -qAtc "SELECT pg_is_in_recovery()")"
assert_eq "streaming" "$(psql "$PRIMARY_URL" -qAtc \
  "SELECT state FROM pg_stat_replication LIMIT 1")"

echo "all checks passed"
