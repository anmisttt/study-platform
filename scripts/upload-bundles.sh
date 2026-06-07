#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: bash scripts/upload-bundles.sh <user>@<vm-ip> [target-dir]"
  exit 1
fi

VM_HOST="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/artifacts"

BACKEND_BUNDLE="${ARTIFACTS_DIR}/backend-bundle.tgz"
FRONTEND_BUNDLE="${ARTIFACTS_DIR}/frontend-bundle.tgz"
VM_PROVISION_SCRIPT="${SCRIPT_DIR}/vm-provision-ubuntu.sh"
VM_DEPLOY_SCRIPT="${SCRIPT_DIR}/vm-deploy-from-bundles.sh"

for required_file in "${BACKEND_BUNDLE}" "${FRONTEND_BUNDLE}" "${VM_PROVISION_SCRIPT}" "${VM_DEPLOY_SCRIPT}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Missing file: ${required_file}"
    echo "Run 'bash scripts/build-bundles.sh' first."
    exit 1
  fi
done

if [[ $# -ge 2 && "$2" != "~" ]]; then
  TARGET_DIR="$2"
  echo "==> Creating target directory on VM (${TARGET_DIR})"
  ssh "${VM_HOST}" "mkdir -p $(printf '%q' "${TARGET_DIR}")"
  SCP_DEST="${VM_HOST}:$(printf '%q' "${TARGET_DIR}")/"
  RUN_PREFIX="${TARGET_DIR}"
else
  echo "==> Ensuring remote home directory exists"
  ssh "${VM_HOST}" 'mkdir -p "$HOME"'
  SCP_DEST="${VM_HOST}:~/"
  RUN_PREFIX='~'
fi

echo "==> Uploading bundles and VM scripts"
scp \
  "${BACKEND_BUNDLE}" \
  "${FRONTEND_BUNDLE}" \
  "${VM_PROVISION_SCRIPT}" \
  "${VM_DEPLOY_SCRIPT}" \
  "${SCP_DEST}"

echo "==> Upload complete"
echo
echo "SSH to VM and run:"
echo "  bash ${RUN_PREFIX}/vm-provision-ubuntu.sh"
echo "  bash ${RUN_PREFIX}/vm-deploy-from-bundles.sh"
echo
echo "Production URL: https://study-platform.me"
