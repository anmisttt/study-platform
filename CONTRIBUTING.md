# Contributing

## Project structure

- `shared` - TypeScript types and route helpers shared by frontend and backend (`@study-platform/shared`)
- `frontend` - React UI with chapter list, practice flow, collaborative drafts, voice input, answer check, and score (see `frontend/README.md`)
- `backend` - Express API: chapters, rooms, LLM answer grading, audio transcription, and a room WebSocket server

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

The frontend talks to the API at `/api` by default and proxies it to `http://localhost:3001` (see `frontend/vite.config.ts`). Override with `VITE_API_URL` if needed.

The backend reads configuration from `backend/.env`:

```env
OPENAI_API_KEY=sk-your-key   # required for grading and transcription
LANGFUSE_PUBLIC_KEY=pk-lf-your-key   # required for tutor prompts and tracing
LANGFUSE_SECRET_KEY=sk-lf-your-key   # required for tutor prompts and tracing
LANGFUSE_BASE_URL=https://cloud.langfuse.com   # use your Langfuse region/self-hosted URL
LANGFUSE_TRACING_ENVIRONMENT=development   # optional, defaults to development locally
PORT=3001                    # optional, default 3001
HOST=127.0.0.1               # optional, default 127.0.0.1
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe   # optional
CORS_ORIGINS=https://study-platform.me,http://localhost:5173   # optional, comma-separated allowlist ("*" to allow all)
```

CORS is restricted to an allowlist. If `CORS_ORIGINS` is unset, the backend allows local dev origins and `study-platform.me` by default. Requests without an `Origin` header (e.g. curl, server-to-server) are always allowed.

## Run with Docker Compose

From project root:

```bash
docker compose up
```

Then open `http://localhost:5173`.

## API

- `GET /health`
- `GET /chapters` - chapter list with theory/practice counts
- `POST /rooms` with `{ "chapterId": "..." }` - create a room for a chapter, returns `{ roomId }`
- `POST /rooms/:roomId/questions/theory/:questionId/check` with `{ "answer": "...", "baseRevision": <n> }`
- `POST /rooms/:roomId/questions/practice/:questionId/check` with `{ "answer": "...", "baseRevision": <n> }`
- `POST /transcribe` - multipart form with an `audio` file, returns `{ text }`
- `WS /ws/rooms/:roomId` - room-scoped connection for room snapshots,
  checked-answer updates, checking state, and question-scoped Yjs drafts. Send
  `watch_question` whenever the active question changes.

Check responses are produced by OpenAI grading and include `rating`, `comment`, and the saved `revision`.
Each tutor check also emits an `evaluate-tutor-answer` Langfuse trace. The trace records the
system prompt name/version, user response, reference answer, tutor comment,
and score. The nested `grade-answer` generation is linked to the Langfuse prompt version and
captures the OpenAI model, tokens, cost, latency, and evaluation context. Student answers and
reference answers are therefore sent to the configured Langfuse project.

## Upload to VM

```bash
./scripts/build-bundles.sh
./scripts/upload-bundles.sh
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
LANGFUSE_PUBLIC_KEY=pk-lf-your-key
LANGFUSE_SECRET_KEY=sk-lf-your-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=production
PORT=3001
```

Re-upload and run `~/vm-deploy-from-bundles.sh` after updating bundles.
