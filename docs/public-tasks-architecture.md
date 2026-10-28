# Public tasks architecture

Updated October 28, 2026. Chapter tasks are public: anyone can open a task link, read the question, navigate the chapter, and reveal the reference answer without signing in or joining a room. Answering, AI checking, voice input, shared drafts, and progress still require a room. Creating a room requires sign-in, and AI features use the room owner's OpenAI key.

**Access matrix**

| Route | Access | Notes |
| --- | --- | --- |
| `GET /chapters` | Public | Chapter list. |
| `GET /chapters/:chapterId` | Public | Chapter content as `RoomDetails` with `roomId: null`, `hasOwnerLlmKey: false`, and no answers. Built by `chapterDetails(chapter, null)` in `backend/src/db/roomContext.ts`, the same code that builds room snapshots. |
| `POST /rooms` | Sign-in | Creates a room owned by the session user. |
| `POST /rooms/:roomId/participants/me`, `GET /me/rooms`, `DELETE /rooms/:roomId` | Sign-in | See [room participation architecture](room-participation-architecture.md). |
| `/ws/rooms/:roomId` | Room | Shared drafts and room snapshots. Anyone with the room link. |
| `POST /rooms/:roomId/questions/:questionId/check`, `POST /realtime/transcription-token` | Room + owner key | Paid with the room owner's OpenAI key; legacy ownerless rooms are rejected. |

**Frontend**

A task URL without `?roomId` (`/chapters/:n/questions/:ref`) renders in read-only mode. `useFetchChapterDetails` loads `GET /chapters/:chapterId` and converts it with `mergeRoomDetailsIntoSession`. The result lives only in React state: it is never written to `roomSessions` or IndexedDB, because there is nothing to track without a room.

In read-only mode the answer box is disabled with the placeholder "Create a room to answer…", the microphone is disabled, and Check stays in place but disabled, with a lock icon. The header shows a muted **No room** line. A hint under the buttons, "Checking needs a room · **Create a room**" ("Sign in to create a room" when signed out), is the one place to create a room from a task. It uses the same handler as the overview: signed-out users go to sign-in with `returnTo` set to the current task; signed-in users create a room and land on the same question inside it. Inside a room the header shows the room ID. To share a task, copy the page URL; to invite someone to a room, share its ID.

The overview page without a room has **Browse questions** as its primary action, which opens the first question in read-only mode. Below it, an **Answer with a room** section holds the Room ID field with Join room and a "No room yet? Create a room" link ("Sign in to create a room" when signed out).
