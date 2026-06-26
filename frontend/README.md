# Frontend

React + Vite single-page app for the Study Platform. It renders a chapter table of contents, a per-chapter practice flow, and collaborative answer drafts shared across a room.

## Tech stack

- React 19 + React Router 7
- Vite 8 (TypeScript)
- Yjs for real-time collaborative drafts (synced over WebSocket)
- Web Speech API for optional voice input
- Shared types from `@study-platform/shared` (the sibling `shared` package)

## Features

- Chapter list / table of contents with on-demand chapter details
- Practice flow over theory and practice questions
- Answer checking against the backend (OpenAI grading: `rating`, `comment`, and saved `revision`)
- Collaborative drafts: answers are shared per `roomId` via Yjs and persisted locally
- Voice input via the browser Speech Recognition API
- Per-question timer and formatted question/answer text

## Project structure

- `src/App.tsx` - routing, chapter loading, per-room session state
- `src/routes/paths.ts` - route + query-string helpers
- `src/components/` - UI (`contest`, `table-of-contents`, `questionCard`, `answer`, `timer`, `formattedText`)
- `src/hooks/useCollaborativeDraft.ts` - Yjs document + WebSocket sync
- `src/utils/` - question flattening, room helpers, draft storage, WebSocket URL building
- `src/styles/` - global and app styles

## Routes

- `/chapters` - landing page / table of contents
- `/chapters/:chapterId/overview?roomId=...` - chapter overview
- `/chapters/:chapterId/questions/:questionRef?roomId=...` - practice a question (a `roomId` is required)

## Run locally

Requires Node.js 20. Build the shared package first (see the root `README.md`), then:

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173`. API and WebSocket requests to `/api` are proxied to the backend at `http://localhost:3001` (see `vite.config.ts`).

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - production build to `dist/`
- `npm run preview` - preview the production build
- `npm run typecheck` - `tsc --noEmit`
- `npm run lint` - ESLint

## Environment variables

- `VITE_API_URL` - API base URL. Defaults to `/api` (relative), which uses the Vite proxy in dev. Set an absolute URL (e.g. `http://localhost:3001`) to bypass the proxy. The WebSocket URL for collaborative drafts is derived from this value.

## Deployment

This app is built into `frontend/dist` and served as static files. See the root `README.md` for the bundle/VM deployment flow.
