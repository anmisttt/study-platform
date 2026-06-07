# Frontend + VM Deployment Flow

This repository includes scripts to deploy bundled frontend/backend artifacts to a VM without running `tsx` in production.

## What Gets Deployed

- Backend: compiled JavaScript from `backend/dist` (+ runtime deps from `backend/package.json`)
- Frontend: static build from `frontend/dist`
- Runtime stack on VM: Node.js + PM2 + Nginx

## Scripts

- `scripts/build-bundles.sh` - builds backend/frontend and creates archives in `artifacts/`
- `scripts/upload-bundles.sh` - uploads the two archives + VM scripts to your server via `scp`
- `scripts/vm-provision-ubuntu.sh` - installs Node.js, Nginx, and PM2 on Ubuntu VM
- `scripts/vm-deploy-from-bundles.sh` - unpacks artifacts, installs backend prod deps, starts PM2, configures Nginx

## 1) Build Bundles Locally

From project root:

```bash
bash scripts/build-bundles.sh
```

This creates:

- `artifacts/backend-bundle.tgz`
- `artifacts/frontend-bundle.tgz`

## 2) Upload Bundles to VM

```bash
bash scripts/upload-bundles.sh <user>@<vm-ip>
```

Optional custom upload directory:

```bash
bash scripts/upload-bundles.sh <user>@<vm-ip> /home/<user>/deploy
```

## 3) Provision VM (Ubuntu)

SSH into VM:

```bash
ssh <user>@<vm-ip>
```

Run:

```bash
bash ~/vm-provision-ubuntu.sh
```

## 4) Deploy On VM

Run:

```bash
bash ~/vm-deploy-from-bundles.sh
```

When you deploy as **root**, the app is installed under `/var/www/study-platform` (not `~/apps/...`) so Nginx can serve static files. Bundles stay in `~/`.

On first run, the script creates `backend/.env` under that app dir and stops. Fill it and run again:

```bash
OPENAI_API_KEY=your_key_here
PORT=3001
```

Then re-run:

```bash
bash ~/vm-deploy-from-bundles.sh
```

## 5) Verify

On VM:

```bash
curl http://127.0.0.1:3001/health
pm2 status
sudo nginx -t
```

In browser:

```text
http://<vm-ip>
```

## Optional Environment Variables For VM Deploy Script

You can customize paths/ports without editing script:

```bash
APP_DIR="/var/www/study-platform" \
BUNDLE_DIR="$HOME" \
API_PORT=3001 \
SITE_NAME=study-platform \
SERVER_NAME=study-platform.me \
bash ~/vm-deploy-from-bundles.sh
```
