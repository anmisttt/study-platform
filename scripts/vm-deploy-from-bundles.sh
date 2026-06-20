#!/usr/bin/env bash
set -euo pipefail

DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Production domain defaults to study-platform.me (https://study-platform.me).
# Override SERVER_NAME=_ for IP-only deploys without HTTPS.
# Nginx runs as www-data and cannot read under /root — use /var/www when deploying as root.
if [[ -n "${APP_DIR:-}" ]]; then
  :
elif [[ "$(id -u)" -eq 0 ]]; then
  APP_DIR="/var/www/study-platform"
else
  APP_DIR="${HOME}/apps/study-platform"
fi
BUNDLE_DIR="${BUNDLE_DIR:-$HOME}"
BACKEND_BUNDLE="${BACKEND_BUNDLE:-$BUNDLE_DIR/backend-bundle.tgz}"
FRONTEND_BUNDLE="${FRONTEND_BUNDLE:-$BUNDLE_DIR/frontend-bundle.tgz}"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
# Secrets live here (outside backend/) so redeploys never wipe them.
APP_ENV="${APP_DIR}/.env"
BACKEND_ENV="${BACKEND_DIR}/.env"
LEGACY_ENV_PATHS=(
  "${HOME}/apps/study-platform/backend/.env"
  "/var/www/study-platform/backend/.env"
  "${BACKEND_DIR}/.env"
)
SITE_NAME="${SITE_NAME:-study-platform}"
API_PORT="${API_PORT:-3001}"
SERVER_NAME="${SERVER_NAME:-study-platform.me}"
ACME_WEBROOT="${ACME_WEBROOT:-/var/www/certbot}"
BACKEND_PROCESS_NAME="${BACKEND_PROCESS_NAME:-study-backend}"

PRIMARY_DOMAIN=""
if [[ "${SERVER_NAME}" != "_" ]]; then
  read -r PRIMARY_DOMAIN _ <<<"${SERVER_NAME}"
fi

SSL_CERT_DIR=""
if [[ -n "${PRIMARY_DOMAIN}" ]]; then
  SSL_CERT_DIR="/etc/letsencrypt/live/${PRIMARY_DOMAIN}"
fi

for required_cmd in tar node npm pm2 nginx; do
  if ! command -v "${required_cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${required_cmd}"
    echo "Run: bash vm-provision-ubuntu.sh"
    exit 1
  fi
done

for bundle_path in "${BACKEND_BUNDLE}" "${FRONTEND_BUNDLE}"; do
  if [[ ! -f "${bundle_path}" ]]; then
    echo "Bundle is missing: ${bundle_path}"
    exit 1
  fi
done

ssl_certificate_available() {
  [[ -n "${SSL_CERT_DIR}" && -f "${SSL_CERT_DIR}/fullchain.pem" && -f "${SSL_CERT_DIR}/privkey.pem" ]]
}

write_nginx_config() {
  local with_ssl="$1"
  local nginx_conf="$2"

  if [[ "${with_ssl}" == "true" ]]; then
    sudo tee "${nginx_conf}" >/dev/null <<EOF
server {
  listen 80;
  server_name ${SERVER_NAME};

  location /.well-known/acme-challenge/ {
    root ${ACME_WEBROOT};
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl;
  server_name ${SERVER_NAME};

  client_max_body_size 30M;

  ssl_certificate ${SSL_CERT_DIR}/fullchain.pem;
  ssl_certificate_key ${SSL_CERT_DIR}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;

  root ${FRONTEND_DIR}/dist;
  index index.html;

  location / {
    try_files \$uri /index.html;
  }

  location /api/drafts/ws {
    proxy_pass http://127.0.0.1:${API_PORT}/drafts/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:${API_PORT}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  else
    sudo tee "${nginx_conf}" >/dev/null <<EOF
server {
  listen 80;
  server_name ${SERVER_NAME};

  client_max_body_size 30M;

  location /.well-known/acme-challenge/ {
    root ${ACME_WEBROOT};
  }

  root ${FRONTEND_DIR}/dist;
  index index.html;

  location / {
    try_files \$uri /index.html;
  }

  location /api/drafts/ws {
    proxy_pass http://127.0.0.1:${API_PORT}/drafts/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:${API_PORT}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
EOF
  fi
}

apply_nginx_config() {
  local with_ssl="$1"
  local nginx_conf="/etc/nginx/sites-available/${SITE_NAME}"

  sudo mkdir -p "${ACME_WEBROOT}"
  write_nginx_config "${with_ssl}" "${nginx_conf}"

  sudo ln -sfn "${nginx_conf}" "/etc/nginx/sites-enabled/${SITE_NAME}"
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  sudo nginx -t
  sudo systemctl reload nginx
}

restore_app_env() {
  if [[ -f "${APP_ENV}" ]]; then
    return 0
  fi

  for legacy_env in "${LEGACY_ENV_PATHS[@]}"; do
    if [[ -f "${legacy_env}" ]]; then
      cp "${legacy_env}" "${APP_ENV}"
      echo "Migrated .env from ${legacy_env} to ${APP_ENV}"
      return 0
    fi
  done

  return 1
}

echo "==> Preparing app directories (${APP_DIR})"
mkdir -p "${APP_DIR}" "${BACKEND_DIR}" "${FRONTEND_DIR}"

ENV_BACKUP=""
if [[ -f "${APP_ENV}" ]]; then
  ENV_BACKUP="$(mktemp)"
  cp "${APP_ENV}" "${ENV_BACKUP}"
else
  for legacy_env in "${LEGACY_ENV_PATHS[@]}"; do
    if [[ -f "${legacy_env}" ]]; then
      ENV_BACKUP="$(mktemp)"
      cp "${legacy_env}" "${ENV_BACKUP}"
      break
    fi
  done
fi

echo "==> Extracting bundles"
tar -xzf "${BACKEND_BUNDLE}" -C "${APP_DIR}"
tar -xzf "${FRONTEND_BUNDLE}" -C "${FRONTEND_DIR}"

if [[ -n "${ENV_BACKUP}" && -f "${ENV_BACKUP}" ]]; then
  cp "${ENV_BACKUP}" "${APP_ENV}"
  rm -f "${ENV_BACKUP}"
fi

echo "==> Installing backend production dependencies"
cd "${BACKEND_DIR}"
bash "${DEPLOY_SCRIPT_DIR}/install-native-deps.sh"
npm install --omit=dev

if ! restore_app_env; then
  cat > "${APP_ENV}" <<EOF
OPENAI_API_KEY=replace_me
PORT=${API_PORT}
EOF
  echo "Created ${APP_ENV} template. Fill OPENAI_API_KEY and re-run this script."
  exit 1
fi

cp "${APP_ENV}" "${BACKEND_ENV}"

echo "==> Restarting backend with PM2"
set -a
source "${APP_ENV}"
set +a

if [[ -z "${OPENAI_API_KEY:-}" || "${OPENAI_API_KEY}" == "replace_me" ]]; then
  echo "OPENAI_API_KEY is missing or still set to the placeholder in ${APP_ENV}"
  echo "Edit the file, set a real key, then re-run this script."
  exit 1
fi

chmod 600 "${APP_ENV}" "${BACKEND_ENV}"
chown "$(id -u)":"$(id -g)" "${APP_ENV}" "${BACKEND_ENV}" 2>/dev/null || true

# Load secrets from .env at runtime (dotenv), not via PM2's saved environment.
unset OPENAI_API_KEY OPENAI_TRANSCRIBE_MODEL

if pm2 describe "${BACKEND_PROCESS_NAME}" >/dev/null 2>&1; then
  pm2 delete "${BACKEND_PROCESS_NAME}"
fi

pm2 start dist/server.js --name "${BACKEND_PROCESS_NAME}" --cwd "${BACKEND_DIR}"
pm2 save

echo "==> Verifying backend is listening on port ${API_PORT}"
for _ in 1 2 3 4 5; do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done
if ! curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
  echo "Backend did not start. Recent PM2 logs:"
  pm2 logs "${BACKEND_PROCESS_NAME}" --lines 40 --nostream || true
  echo "Try manually: cd ${BACKEND_DIR} && node dist/server.js"
  exit 1
fi

echo "==> Configuring Nginx"
if ssl_certificate_available; then
  echo "Using SSL certificate at ${SSL_CERT_DIR}"
  apply_nginx_config true
else
  if [[ -n "${PRIMARY_DOMAIN}" ]]; then
    echo "Warning: no certificate at ${SSL_CERT_DIR}; serving HTTP only"
  fi
  apply_nginx_config false
fi

echo "==> Deployment complete"
echo "Backend health: curl http://127.0.0.1:${API_PORT}/health"
if ssl_certificate_available; then
  echo "Public app: https://${PRIMARY_DOMAIN}"
elif [[ -n "${PRIMARY_DOMAIN}" ]]; then
  echo "Public app: http://${PRIMARY_DOMAIN}"
else
  echo "Public app: http://$(hostname -I | awk '{print $1}')"
fi
