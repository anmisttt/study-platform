# Contributing

## Project structure

- `shared` - TypeScript types and route helpers shared by frontend and backend (`@study-platform/shared`)
- `frontend` - React UI with chapter list, practice flow, collaborative drafts, voice input, answer check, and score (see `frontend/README.md`)
- `backend` - Express API: chapters, rooms, LLM answer grading, audio transcription, and a room WebSocket server

## Run locally

Use Node.js 24 (`nvm use` reads `.nvmrc`).

From the repository root, build shared types once (required before backend/frontend install or build):

```bash
npm ci --prefix shared
npm run build --prefix shared
```

Install the backend and copy the configuration template. Fill the secrets and settings described below before starting it:

```bash
npm ci --prefix backend
cp backend/.env.example backend/.env
npm run start --prefix backend
```

Frontend (new terminal):

```bash
npm ci --prefix frontend
npm run dev --prefix frontend
```

Optional checks:

```bash
npm run build --prefix shared
npm run build --prefix backend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

The frontend talks to the API at `/api` by default and proxies it to `http://localhost:3001` (see `frontend/vite.config.ts`). Override with `VITE_API_URL` if needed.

The backend reads configuration from `backend/.env`. Generate and fill two separate secrets:

```bash
openssl rand -hex 32 # BETTER_AUTH_SECRET
openssl rand -hex 32 # LLM_KEY_ENCRYPTION_SECRET (a separate secret)
```

`BETTER_AUTH_SECRET` signs sessions and protects OAuth tokens. `LLM_KEY_ENCRYPTION_SECRET` encrypts users' OpenAI keys (64 hexadecimal characters). Preserve both secrets across deployments and back them up separately from SQLite. Changing the encryption secret without re-encrypting stored credentials makes those credentials unreadable; users must replace their keys.

Set `PUBLIC_APP_URL` to the frontend origin (`http://localhost:5173` locally, `https://study-platform.me` in production). `CORS_ORIGINS` may add explicit frontend origins; wildcard origins are rejected. Account mutations, grading, transcription-token requests, and WebSocket connections require an allowed `Origin`. Same-origin browser requests set it automatically. Custom curl clients must provide `-H 'Origin: http://localhost:5173'` for mutations.

Register Google and GitHub OAuth applications and configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`. Redirect URLs are:

- `<PUBLIC_APP_URL>/api/auth/callback/google`
- `<PUBLIC_APP_URL>/api/auth/callback/github`

Use separate development and production OAuth applications. A provider's button is shown only when both its credentials are configured. OAuth emails must be verified before account linking; sign-in methods are not linked by an unverified email alone.

Set `SMTP_HOST`, `SMTP_PORT` (587 by default), `SMTP_SECURE` (`true` for implicit TLS on port 465), `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Email/password accounts require verification before login. Verification/resend and password reset use SMTP. Production requires SMTP configuration; local registration/recovery is unavailable until SMTP is configured. For local mail testing, use a mail-catching SMTP server and open its inbox. Tests inject a mail sink and never send email externally.

`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` remain required for real grading. `LANGFUSE_TRACING_ENVIRONMENT` defaults according to `NODE_ENV`. The web server no longer needs `OPENAI_API_KEY`; that variable is used only by `npm run grade-practice`. Grading and voice input always resolve the room owner's saved key. Saving a key performs no provider request, and does not verify credit or model access.

Production must set `NODE_ENV=production` and an HTTPS `PUBLIC_APP_URL`. Session cookies are HttpOnly, SameSite=Lax, and Secure in production, with database-backed revocation and no JWT/cookie session cache. The HTTP API is served through the frontend origin. Vite and nginx preserve `/api/auth/*` for Better Auth and strip `/api` for other backend routes. Direct API deployments can set `VITE_API_URL` and `VITE_AUTH_URL` explicitly, with the corresponding trusted frontend origin.

## Run with Docker Compose

From project root:

```bash
docker compose up
```

Then open `http://localhost:5173`.

## API

Browser URLs use the `/api` prefix. Backend paths below omit it, except auth routes which retain `/api/auth`.

- `GET /health`, `GET /chapters`, `GET /auth-options` — public health, chapter metadata and available sign-in methods.
- `/api/auth/*` — Better Auth social and email/password sign-in, registration, verification, recovery, sessions and logout.
- `GET /me` — returns the signed-in user's private, name-free profile and OpenAI key status.
- `PUT /me/llm-key` with `{ "apiKey": "..." }`, `DELETE /me/llm-key` — current user's encrypted OpenAI key. Responses contain only presence, last four characters and update time.
- `GET /me/rooms` — the signed-in user's authored and joined rooms, ordered by their last open. Summaries include `isAuthor`, `joinedAt`, `lastOpenedAt`, shared progress, average rating and continuation question.
- `POST /rooms` with `{ "chapterId": "..." }` — requires a session and atomically creates the room and its author's participant record; returns `{ roomId }`. Room-ID collisions retry with a fresh ID, up to ten attempts; other insert failures roll back without entering that retry loop.
- `POST /rooms/:roomId/participants/me` — records participation for the session user, or updates their last-open time. No body or chapter validation; requires an existing room. Returns `{ participationCreated }`. Signed-in overview and question routes call it automatically.
- `DELETE /rooms/:roomId` — creator only; disconnects participants and deletes saved room progress.
- `POST /rooms/:roomId/questions/:questionRef/check` with `{ "answer": "...", "baseRevision": 0 }` — public, using the owner's key; question refs are `theory-0`, `practice-0`, etc. Returns `rating`, `comment`, `revision`. Concurrent checks of the same question are rejected before the LLM request.
- `POST /realtime/transcription-token` with `{ "roomId": "...", "languages": ["en"] }` — public, using the owner's key; returns only a short-lived OpenAI client secret.
- `WS /ws/rooms/:roomId` — public collaboration. Clients send `watch_question` and Yjs `update` messages. Only the server sends shared `checking` status. Room snapshots include `hasOwnerLlmKey` and update when the owner changes/removes their key.

Application errors contain `{ error, code }`, with revision conflicts additionally including the current room. Codes distinguish missing/invalid owner keys, quota, model access, provider availability, authentication and concurrent checks. SQLite write contention returns 503 with `DATABASE_BUSY`, separately from room-ID collisions. No web request falls back to a participant's or environment key.

Langfuse traces preserve room session IDs and prompt versions, use the owner's user ID for cost attribution, and record the initiating account ID (or `anonymous`) separately. Student and reference answers are sent to the configured Langfuse project. Credential fields and provider error details are redacted before export.

## Database and tests

The backend initializes the current SQLite schema on startup. New databases get the account, room, credential, and participation tables directly; initialization leaves existing tables and data intact. The schema is defined in `backend/src/db/schemas.ts`.

Ownerless rooms keep their links and cleanup schedule (empty: one day; nonempty: one month of inactivity), and cannot use AI features. Owned rooms remain until manually deleted. Room progress counts successfully graded questions regardless of rating; retries replace a result, and drafts are excluded.

Room creation also inserts the author's `room_participants` record using the room's creation time. Other participants appear after a signed-in open. Deleting a room cascades to its participant records. See [room participation architecture](docs/room-participation-architecture.md).

To make a consistent backup of the configured database, run `npm run backup-database --prefix backend`. Backups are stored beside the database with a `.backup-<timestamp>` suffix.

```bash
npm test
npm run lint
npm run build --prefix shared
npm run build --prefix backend
npm run typecheck --prefix frontend
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npm run test:e2e
```

Browser tests start an isolated API on `3081` and frontend on `5183`, using in-memory SQLite, captured mail, and fake LLM responses. They exercise real session cookies, verification/reset, profiles, owner-key guest grading, collaboration, retention of drafts through sign-in and deletion. No external OAuth, SMTP or LLM credentials are used.

Before release, verify Google and GitHub callbacks, verification/password-reset email delivery, a real grading request, a voice transcription session, and the resulting Langfuse trace in staging. Confirm the billed user is the room owner and no credential appears in the trace. These checks require configured staging credentials.

## Upload to VM

```bash
./scripts/build-bundles.sh
./scripts/upload-bundles.sh <user>@<vm-host>
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

Use the variables in `backend/.env.example`, with `NODE_ENV=production`, your HTTPS public URL, production OAuth callbacks, SMTP credentials, and Langfuse credentials. The deploy script validates configuration, stops the old backend, installs both bundles, makes a consistent SQLite backup, and restarts the app. It preserves the database and secrets between releases.

Deploy frontend and backend together. For rollback, stop the service and restore the matching database backup, previous bundles, and their deployment configuration.

Re-upload and run `~/vm-deploy-from-bundles.sh` after updating bundles.
