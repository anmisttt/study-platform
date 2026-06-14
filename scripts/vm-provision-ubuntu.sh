#!/usr/bin/env bash
set -euo pipefail

if ! command -v apt >/dev/null 2>&1; then
  echo "This script is intended for Ubuntu/Debian (apt-based systems)."
  exit 1
fi

echo "==> Installing OS packages"
sudo apt update
sudo apt install -y curl git nginx

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> Installing native deps for SQLite (better-sqlite3)"
bash "${SCRIPT_DIR}/install-native-deps.sh"

echo "==> Installing Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> Provision complete"
node -v
npm -v
pm2 -v
