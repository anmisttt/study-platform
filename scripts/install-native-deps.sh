#!/usr/bin/env bash
set -euo pipefail

# Native build deps for better-sqlite3 (node-gyp + SQLite headers).
APT_PACKAGES=(build-essential python3 libsqlite3-dev)

apt_packages_installed() {
  local pkg
  for pkg in "${APT_PACKAGES[@]}"; do
    if [[ "$(dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null)" != "install ok installed" ]]; then
      return 1
    fi
  done
}

if command -v apk >/dev/null 2>&1; then
  apk add --no-cache python3 make g++ sqlite-dev
elif command -v apt-get >/dev/null 2>&1; then
  if apt_packages_installed; then
    echo "Native deps already installed (${APT_PACKAGES[*]}); skipping apt."
  elif [[ "$(id -u)" -eq 0 ]]; then
    apt-get update
    apt-get install -y --no-install-recommends "${APT_PACKAGES[@]}"
  else
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends "${APT_PACKAGES[@]}"
  fi
else
  echo "install-native-deps.sh: unsupported platform (need apk or apt-get)." >&2
  exit 1
fi
