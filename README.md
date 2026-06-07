# Study Platform

Live site: [https://study-platform.me](https://study-platform.me)

Simple TypeScript full-stack app for practicing chapter questions, checking answers, and getting a score summary.

## Stack

- Frontend: React + Vite (TypeScript SPA)
- Backend: Express.js (TypeScript)
- Storage/Auth: none (in-memory only, no authorization)

## Project structure

- `shared` - TypeScript types shared by frontend and backend (`@study-platform/shared`)
- `frontend` - React UI with chapter list, practicing flow, voice input, answer check, retry, summary score
- `backend` - Express API with mock LLM check endpoints and health endpoint

## Run locally

Use Node.js 20 (`nvm use` reads `.nvmrc`).

Build shared types once (required before backend/frontend install or build):

```bash
cd shared
npm install
npm run build
```

Backend:

```bash
cd backend
npm install
npm run start
```

Frontend (new terminal):

```bash
cd frontend
npm install
npm run dev
```

Optional checks:

```bash
cd shared && npm run build
cd backend && npm run build
cd frontend && npm run typecheck && npm run build
```

Frontend expects backend at `http://localhost:3001` by default.
If needed, set `VITE_API_URL` in frontend environment.

## Run with Docker Compose

From project root:

```bash
docker compose up
```

Then open `http://localhost:5173`.

## API

- `GET /health`
- `GET /chapters`
- `GET /chapters/:chapterId` (chapter details on demand)
- `POST /check/:chapterId/theory/:questionId` with `{ "answer": "..." }`
- `POST /check/:chapterId/practice/:questionId` with `{ "answer": "..." }`

Responses are mocked to simulate LLM grading and include `rating`, `comment`, and reference answer/solutions.

## Upload to vm

```bash
./scripts/build-bundles.sh 
./scripts/upload-bundles.sh ubuntu-s-1vcpu-512mb-10gb-ams3
```

SSH to VM and run:

```bash
~/vm-provision-ubuntu.sh #optional
~/vm-deploy-from-bundles.sh
```

On first deploy, create secrets at the app root (survives redeploys):

```bash
# as ubuntu user:
nano ~/apps/study-platform/.env

# if you deploy with sudo/root:
sudo nano /var/www/study-platform/.env
```

```env
OPENAI_API_KEY=sk-your-key
PORT=3001
```

Re-upload and run `~/vm-deploy-from-bundles.sh` after updating bundles.
