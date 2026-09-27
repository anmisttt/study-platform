#!/usr/bin/env bash
set -euo pipefail

seed='424242'
config="${1:-simulation.toml}"
output_dir="$(mktemp -d)"
trap 'rm -rf "$output_dir"' EXIT

awk '
  function trim(value) {
    sub(/^[[:space:]]+/, "", value)
    sub(/[[:space:]]+$/, "", value)
    return value
  }

  function finish_workload() {
    if (!in_workload) return
    workload_count++
    if (test_name == "\047AtomicOps\047" || test_name == "\"AtomicOps\"") {
      atomic_count++
      if (transactions_per_second != "100.0" || test_duration != "2.0") invalid = 1
    } else if (test_name == "\047RandomClogging\047" || test_name == "\"RandomClogging\"") {
      clogging_count++
      if (test_duration != "2.0") invalid = 1
    } else {
      invalid = 1
    }
  }

  /^[[:space:]]*\[\[/ {
    finish_workload()
    in_workload = ($0 ~ /^[[:space:]]*\[\[test\.workload\]\][[:space:]]*(#.*)?$/)
    test_name = ""
    transactions_per_second = ""
    test_duration = ""
    next
  }

  in_workload && /^[[:space:]]*testName[[:space:]]*=/ {
    value = $0
    sub(/^[^=]*=/, "", value)
    sub(/[[:space:]]*#.*$/, "", value)
    test_name = trim(value)
  }

  in_workload && /^[[:space:]]*transactionsPerSecond[[:space:]]*=/ {
    value = $0
    sub(/^[^=]*=/, "", value)
    sub(/[[:space:]]*#.*$/, "", value)
    transactions_per_second = trim(value)
  }

  in_workload && /^[[:space:]]*testDuration[[:space:]]*=/ {
    value = $0
    sub(/^[^=]*=/, "", value)
    sub(/[[:space:]]*#.*$/, "", value)
    test_duration = trim(value)
  }

  END {
    finish_workload()
    if (workload_count != 2 || atomic_count != 1 || clogging_count != 1 || invalid) {
      print "simulation.toml must define the required AtomicOps and RandomClogging workloads" > "/dev/stderr"
      exit 1
    }
  }
' "/work/$config"

run_simulation() {
  local run_id="$1"
  mkdir -p "$output_dir/$run_id"
  (
    cd "$output_dir/$run_id"
    /usr/bin/fdbserver -r simulation -f "/work/$config" -s "$seed" -b on
  )
}

run_simulation run-1 > "$output_dir/run-1.log"
run_simulation run-2 > "$output_dir/run-2.log"

for log in "$output_dir/run-1.log" "$output_dir/run-2.log"; do
  grep -Fq "Random seed is $seed" "$log"
  grep -Eq '^(AtomicOps;RandomClogging|RandomClogging;AtomicOps) complete$' "$log"
  grep -Fq '1 tests passed; 0 tests failed.' "$log"
done

sed '/^Elapsed:/d' "$output_dir/run-1.log" > "$output_dir/run-1.normalized"
sed '/^Elapsed:/d' "$output_dir/run-2.log" > "$output_dir/run-2.normalized"
read -r run_1_hash _ < <(sha256sum "$output_dir/run-1.normalized")
read -r run_2_hash _ < <(sha256sum "$output_dir/run-2.normalized")
test "$run_1_hash" = "$run_2_hash"

printf 'simulation verification passed: seed %s replayed identically\n' "$seed"
