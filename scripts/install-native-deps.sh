#!/usr/bin/env bash
set -euo pipefail

# Native build deps for better-sqlite3 (node-gyp + SQLite headers).
if command -v apk >/dev/null 2>&1; then
  apk add --no-cache python3 make g++ sqlite-dev
elif command -v apt-get >/dev/null 2>&1; then
  if [[ "$(id -u)" -eq 0 ]]; then
    apt-get update
    apt-get install -y --no-install-recommends build-essential python3 libsqlite3-dev
  else
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends build-essential python3 libsqlite3-dev
  fi
else
  echo "install-native-deps.sh: unsupported platform (need apk or apt-get)." >&2
  exit 1
fi
