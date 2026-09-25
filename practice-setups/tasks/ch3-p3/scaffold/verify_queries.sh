#!/usr/bin/env bash
set -euo pipefail

pg_output="$(docker compose exec -T postgres psql -XAtF, -v ON_ERROR_STOP=1 -U postgres -d lab < postgres_compare.sql)"
expected_pg=$'logger,2.0.0,1\nwebserver,2.3.1,1\nrouter,1.4.0,2\nutils,1.1.0,2\ncrypto,4.2.0,3\nhttp-lib,3.1.0,3\nlogger,2.0.0,1\nmyapp,1.0.0,2\nwebserver,2.3.1,2'
test "$pg_output" = "$expected_pg"

orient_output="$(docker compose exec -T orientdb /orientdb/bin/console.sh /lab/orient_compare.osql)"

extract_orient_rows() {
  local hop_column="$1"

  awk -F'|' -v hop_column="$hop_column" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }

    /^[[:space:]]*\|/ {
      for (i = 1; i <= NF; i++) {
        field[i] = trim($i)
      }

      if (field[2] == "#") {
        active = field[3] == hop_column
        if (active) {
          headers++
          if (NF != 6 || field[4] != "name" || field[5] != "version") {
            invalid = 1
          }
        }
        next
      }

      if (active && field[2] ~ /^[0-9]+$/) {
        if (NF != 6) {
          invalid = 1
          next
        }
        print field[3] "|" field[4] "|" field[5]
        next
      }

      if (active) {
        invalid = 1
      }
    }

    END {
      if (headers != 1 || invalid) {
        exit 1
      }
    }
  ' <<<"$orient_output"
}

orient_forward="$(extract_orient_rows min_hops)"
expected_orient_forward=$'1|logger|2.0.0\n1|webserver|2.3.1\n2|router|1.4.0\n2|utils|1.1.0\n3|crypto|4.2.0\n3|http-lib|3.1.0'
test "$orient_forward" = "$expected_orient_forward"

orient_reverse="$(extract_orient_rows hops_from_utils)"
expected_orient_reverse=$'1|logger|2.0.0\n2|myapp|1.0.0\n2|webserver|2.3.1'
test "$orient_reverse" = "$expected_orient_reverse"

echo 'All dependency traversal checks passed.'
