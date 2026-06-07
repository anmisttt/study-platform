#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/artifacts"

SHARED_DIR="${ROOT_DIR}/shared"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

mkdir -p "${ARTIFACTS_DIR}"

echo "==> Building shared package (used by backend at runtime and frontend at build time)"
cd "${SHARED_DIR}"
npm install
npm run build

echo "==> Building backend bundle"
cd "${BACKEND_DIR}"
npm ci
npm run build
rm -rf dist/data
# Avoid macOS AppleDouble (._*) files in the bundle — they break JSON.parse on Linux.
export COPYFILE_DISABLE=1
cp -R src/data dist/data
tar -czf "${ARTIFACTS_DIR}/backend-bundle.tgz" \
  -C "${ROOT_DIR}" \
  backend/dist \
  backend/package.json \
  backend/package-lock.json \
  shared/package.json \
  shared/dist

echo "==> Building frontend bundle (Vite bundles shared into dist; no shared/ on VM)"
cd "${FRONTEND_DIR}"
npm ci
npm run build
tar -czf "${ARTIFACTS_DIR}/frontend-bundle.tgz" dist

echo "==> Bundles are ready:"
echo "  ${ARTIFACTS_DIR}/backend-bundle.tgz"
echo "  ${ARTIFACTS_DIR}/frontend-bundle.tgz"
echo
echo "Next step:"
echo "  bash scripts/upload-bundles.sh <user>@<vm-ip>"
