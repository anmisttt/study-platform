# Study Platform

Live site: [https://study-platform.me](https://study-platform.me)

It’s a learning platform with theory questions, practical tasks, and an AI tutor that compares your answers with a reference solution, then gives feedback and a score.

I built it because I want AI to help deepen understanding, not just solve problems for you.

Right now, it focuses on software engineering topics based on *Designing Data-Intensive Applications* (2nd edition). The content is generated from my notes which I made while reading.

It also includes rooms that share the same state between different participants and collaborative editing with CRDT allowing several people in one room to work on an answer together.

To start practicing, you just need to choose a chapter and generate a new room.

## Stack

- Frontend: React 19 + Vite (TypeScript SPA)
- Backend: Express 5 (TypeScript, run via `tsx`)
- LLM: OpenAI (answer grading + audio transcription)
- Storage: SQLite (`better-sqlite3`) for rooms and saved answers
- Collaboration: Yjs drafts synced over WebSocket (per room)
- Auth: none (no authorization)

## Develop

Local setup, API notes, Docker, and VM deploy: see [CONTRIBUTING.md](CONTRIBUTING.md).
