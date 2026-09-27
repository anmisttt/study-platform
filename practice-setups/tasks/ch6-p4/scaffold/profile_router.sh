#!/usr/bin/env bash
set -euo pipefail

PRIMARY_URL="postgresql://postgres@primary:5432/lab"
STANDBY_URL="postgresql://postgres@standby:5432/lab"

case "${1:-}" in
  write)
    # TODO: write on the primary and record its LSN
    ;;
  read)
    # TODO: route a read by last-write age
    ;;
  wait-read)
    # TODO: wait for replay or fall back to the primary
    ;;
  *)
    echo "usage: $0 {write USER_ID BIO|read USER_ID|wait-read USER_ID}" >&2
    exit 2
    ;;
esac
