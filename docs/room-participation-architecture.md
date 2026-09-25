# Room participation architecture

Architecture and implementation plan, updated September 24, 2026. The database, API, and profile changes are implemented in the workspace. The backend initializes the current schema on startup; development verification uses isolated test databases.

**Recommended behavior**

A signed-in user's profile lists every room they created and every valid room they opened while signed in. Opening a shared link saves the room automatically; there is no Join or Save step. Only the room's author can delete it. Opening a room while signed in registers the current account as a participant automatically and never changes the room's author. Authors are participants too.

Author-only deletion is enforced in `RoomsDb.deleteOwnedRoom()`. `GET /me/rooms` calls `listParticipatedRooms()` and derives each room's role from its owner. Room content and progress are shared by everyone; the room author's API key powers AI features.

**Profile behavior**

Use one room list in the existing profile, with a role on each room and filters for rooms created by the user versus rooms they joined.

- Title: **Your rooms**. Supporting text: “Rooms you create or open while signed in are saved here.”
- Filters: **All**, **Author**, **Participant**, with counts. All is selected initially and shows every room connected to the user. Author shows rooms with `isAuthor === true`; Participant shows rooms with `isAuthor === false`, including legacy rooms with no recorded author. Opening a valid link while signed in registers participation automatically; no additional action is required. Authors have participant records in the database, but their rooms appear under Author rather than Participant in these role filters.
- Each card shows chapter number/title, room ID, **Author** or **Participant**, shared progress, theory/practice counts, average score, and **Last opened**. Retain a separate **Progress updated** timestamp so another person's work is not mistaken for your own visit.
- Actions: **Continue** and **Copy link** for both roles; **Delete** only for authors. Continue uses the existing next-unchecked-question calculation. It is not a personal reading-position bookmark.
- Sort by the current user's `last_opened_at`, newest first, then room ID as a stable tie-breaker. Creating a room initializes its author's entry with the room's creation time. Changes by other participants do not reorder your list.
- An author reopening their own room updates recency without adding a duplicate card or putting the room in the Participant filter.
- After the first successful save, the room view briefly says “Room saved to your profile.” Show success only after the server confirms it. Repeat opens need no notice.
- Do not show another participant's email, the author's email, or a participant roster. The existing user model has no display-name field.

| State | UI behavior |
| --- | --- |
| No rooms | “Your rooms will appear here. Create a room from a chapter, or open a shared room link while signed in.” Link to Chapters. |
| Author filter is empty | “You haven't created any rooms yet.” Link to Chapters. |
| Participant filter is empty | “Open a shared room link while signed in to find it here later.” |
| Loading | A room-list loading indicator; do not flash the empty state. |
| List fetch fails | Keep already-loaded cards and show “Couldn't load your rooms” with Retry. |
| Participation registration fails | Keep the room usable. Show “Couldn't save this room to your profile” with Retry; retry on reconnect/focus while still viewing that room. |
| Author chooses Delete | Modal confirmation: “Delete this room for everyone? Its saved progress will be deleted and everyone in the room will be disconnected.” Actions: Delete for everyone / Cancel. Focus Cancel by default; Escape dismisses while no deletion is pending. |
| Deletion completes | Close the confirmation and remove the card without a success badge. If another tab deleted it first, a 404 also removes the stale card. |
| Someone else deletes a room | Existing sockets report the room was deleted. Refresh the profile on mount and focus so its card disappears. |

For this first version, participants have no removal action. A future “Remove from profile” action would only remove their own participation record; it must be distinct from deleting a room and would need a decision about reappearing on the next open.

**Database relationship**

Use `room_participants` as the complete source of rooms listed in a user's profile. Each row represents one user's participation in one room, with the time they joined and the time they last opened it. Creating a room inserts its author's participant row immediately; opening someone else's room inserts that participant's row.

The relationships are: one user can author many rooms; many users can be connected to many rooms through `room_participants`. Every owned room must have an author row. This makes the list query a single join between `room_participants` and `rooms`; there is no separate ownership branch or `UNION`. The join is still needed for chapter information and shared answers/progress stored on the room.

Keep `rooms.owner_user_id` as the single source of authorship for profile labels, deletion, and owner-funded AI features. The joined room already supplies this value, so the API derives `isAuthor` with `room.owner_user_id === session.user.id`. There is no stored author flag to synchronize. Inserting the author's participant row at creation makes the simpler list query possible.

SQLite schema defined in `backend/src/db/schemas.ts`:

```sql
CREATE TABLE room_participants (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, room_id),
  CHECK (last_opened_at >= joined_at)
);

CREATE INDEX room_participants_user_recent_idx
  ON room_participants(user_id, last_opened_at DESC, room_id);

CREATE INDEX room_participants_room_idx ON room_participants(room_id);
```

The recent-rooms index supports filtering by user and reading entries in `(last_opened_at DESC, room_id)` order. Its trailing `room_id` matches the explicit tie-breaker. The room index supports cascading deletion of all participant rows for a room. The creation transaction ensures that every new owned room has its author's participant row.

Enable `PRAGMA foreign_keys = ON` on every connection before starting application transactions, as the current database setup already does. This enables reference validation and the declared cascading deletes.

| Field | Purpose |
| --- | --- |
| `user_id` | Current account, referencing the real `"user"` table, not the `auth_user` adapter view. |
| `room_id` | Existing shared room. |
| `joined_at` | When participation starts: room creation for the author, first authenticated open for another participant. |
| `last_opened_at` | Initialized with the first timestamp and advanced on authenticated opens, using server time. |
| Composite primary key | One record per user/room even with repeated requests or multiple tabs. |

Write rules:

- Create the room and its author's participant row in the same transaction. Either both persist or neither does. Initialize both participation timestamps from the newly inserted room's `created_at`.
- When registering participation, take the user ID from the authenticated session and timestamps from the server. Requests cannot set ownership or an author role.
- On subsequent opens, retain `joined_at` and advance `last_opened_at`. Registering participation never updates `rooms.owner_user_id`.
- Keep the existing `DELETE ... WHERE id = ? AND owner_user_id = ?` check. A derived response flag controls UI visibility; deletion authorization uses the stored room owner on every request.

Deleting a room cascades to all its participant rows; deleting a participant account cascades only to that account's participation records. The existing restriction on deleting an account that owns rooms is unaffected. The author row cannot be removed independently through a profile API.

Participation registration and recency updates do not change `rooms.updated_at`, answers, or drafts. A profile connection does not make a room private or grant a new permission: anyone with the link can still collaborate as they do today. Legacy rooms remain without an author and retain the existing cleanup policy, even after a signed-in user joins; saving one does not claim ownership or prevent cleanup.

Use the same UTC SQLite timestamp format as the existing room tables and serialize it as ISO 8601 in API responses. The author joins when the room is created. When an author's `last_opened_at` equals the room's `created_at`, label that timestamp **Created**; otherwise label it **Last opened**. Participation persists after a user closes the room. This table connects accounts to rooms; it does not represent who is currently online or require the user to submit an answer.

**Proposed API and tracking flow**

API paths below match backend route names; the frontend uses its existing API-base prefix.

| Route | Contract |
| --- | --- |
| `POST /rooms` | Require a session. Insert the room and the author's participant row in one transaction, then return the existing `{ roomId }` response. |
| `POST /rooms/:roomId/participants/me` | Require an authenticated session and the existing trusted-origin check. No request body is needed. Link the session's user ID to `roomId` from the path and set timestamps on the server. Require only that the referenced room exists. Upsert and return `200 { participationCreated: boolean }`. Return 401 for no session and 404 if the room does not exist. |
| `GET /me/rooms` | Read the session user's `room_participants` rows joined to `rooms`, returning progress and `isAuthor`. No writes. |
| `DELETE /rooms/:roomId` | Keep the existing author-qualified delete and 204 success. Keep the existing 404 for non-authors or absent rooms and 401 for signed-out users. A participant row never satisfies this check. |

For `POST /rooms`, use a normal transaction. Its first statement is an `INSERT`, so `BEGIN` acquires the write transaction when that statement runs; `BEGIN IMMEDIATE` is unnecessary here. SQLite allows only one writer per database at a time. The participation endpoint below reads before writing and uses an immediate transaction to avoid a read-to-write upgrade race. See [SQLite transaction behavior](https://www.sqlite.org/lang_transaction.html).

Full room-creation SQL:

```sql
BEGIN;

INSERT INTO rooms (id, chapter_id, owner_user_id)
VALUES (:room_id, :chapter_id, :user_id);

INSERT INTO room_participants (user_id, room_id, joined_at, last_opened_at)
SELECT owner_user_id, id, created_at, created_at
FROM rooms
WHERE id = :room_id;

COMMIT;
```

Bind `:room_id` to a server-generated ID, `:chapter_id` to the selected chapter, and `:user_id` to the authenticated session user. The room's other fields use their existing defaults. On any failure, stop executing the statements and roll back the transaction; return `{ roomId }` only after a successful commit. SQLite's default constraint handling aborts the failed statement but can leave the transaction active, so the backend must ensure rollback, for example through its transaction helper. See [SQLite conflict handling](https://www.sqlite.org/lang_conflict.html).

Concurrent creation and room-ID collisions:

- `rooms.id` being a primary key is the final uniqueness guarantee. An existence check before insertion cannot rule out a concurrent request selecting the same ID.
- If A and B try the same ID, the first writer proceeds. The other waits according to the configured busy timeout or receives `SQLITE_BUSY`. If A commits and B then proceeds, B's room insert fails on the primary key. If A rolls back, B can insert that ID.
- Catch a duplicate-key error specifically from inserting `rooms.id`, roll back, generate a new ID, and retry the entire creation transaction, up to ten attempts. Do not continue to the participant insert after the room insert fails.
- Handle `SQLITE_BUSY` separately as transient write contention, returning HTTP 503 with `DATABASE_BUSY` after the connection's existing busy timeout; it does not establish an ID collision. Other constraint failures must not trigger the room-ID retry loop.
- If retries are exhausted, return an error without leaving a newly created room or participant record from a failed attempt. The winning transaction's existing room and author remain intact.

Participation registration links `userId` and `roomId`. Use the database directly to record that relationship. The endpoint performs no chapter lookup or chapter validation and does not call `getRoomDetails()`. The room-existence condition in the upsert and the foreign keys protect the relationship.

In a short synchronous DB transaction, inspect whether a participant row exists and then upsert it; return `participationCreated` accurately even when two tabs open together. An author already has an entry from creation, so opening that room returns `participationCreated: false`. If the room has been deleted, return 404 without recreating anything. Use an immediate write transaction for this read-then-write operation so separate connections cannot race on the existence check; keep the transaction synchronous and short.

```sql
INSERT INTO room_participants (user_id, room_id)
SELECT :user_id, id
FROM rooms
WHERE id = :room_id
ON CONFLICT (user_id, room_id) DO UPDATE
SET last_opened_at = MAX(room_participants.last_opened_at, excluded.last_opened_at);
```

Check that the upsert affects a row; a missing room is a 404, not a successful save. The statement checks room existence directly without loading room details. If a missing author entry is encountered, investigate the creation path; a later open can restore the profile connection but cannot reconstruct its original participation history.

Suggested query for the complete list:

```sql
SELECT r.*, p.joined_at, p.last_opened_at
FROM room_participants p
JOIN rooms r ON r.id = p.room_id
WHERE p.user_id = :user_id
ORDER BY p.last_opened_at DESC, p.room_id;
```

The composite primary key ensures each room appears once for a user. The initial UI can filter the returned list with the API's derived `isAuthor` value. No extra ownership query is needed because the joined row already contains `owner_user_id`.

Generalize `OwnedRoomSummary` to `ProfileRoomSummary`, preserving its existing chapter, progress, creation/update, and continue-reference fields, and adding:

```ts
type ProfileRoomSummary = {
  // Existing room summary fields retained.
  isAuthor: boolean;
  joinedAt: string;
  lastOpenedAt: string;
};
```

Set the response's `isAuthor` to `room.owner_user_id === session.user.id`; this is a computed boolean, not a database column. It is false for legacy ownerless rooms. The UI uses it for the Author/Participant badge, filter, and visibility of Delete; the server independently checks `rooms.owner_user_id` on every delete. Both timestamps are non-null. The API need not expose `owner_user_id` itself.

Implement a route-level `useRoomParticipation` effect driven by the active room ID and authenticated user ID once the room route is resolved. It must run on **both overview and question routes**. The current WebSocket hook runs only in question mode, so tracking solely from WebSocket snapshots would miss overview links. Participation registration depends on the authenticated account and room existence; it should not wait for chapter data, an answer check, or a draft edit. The request sends the room ID in the path and the session cookie, with no chapter ID or request body.

Register once per user/room route entry. Moving between questions in the same room or receiving a snapshot does not create additional participation requests. Leaving and later returning to a room records a new last-open time. Session resolution or signing in while already viewing a room triggers registration. Deduplicate repeated effects within a route entry; database uniqueness is the final guard for retries and concurrent tabs. After a failed save, retain retry eligibility. Cancel or ignore stale responses when the account/room changes, and never replay one account's pending request under another account.

Opening an invalid link creates no participation record. Opening a valid room while signed out creates no account relationship. If that user subsequently signs in and returns to the room through the existing `returnTo` flow, record the current room then. Past anonymous opens are not imported from browser history. A loading or unavailable account service must not register participation under a guessed account.

There is a network boundary between opening a room and saving the participation record. A failed save must remain visible and retryable; the UI must not imply that unsaved rooms will be listed on another device. Successfully registered participation is persisted centrally, making the room available in the user's profile on any signed-in device.

**Database initialization and delivery**

`RoomsDb.initializeSchema()` creates the current tables, indexes, view, and triggers in a transaction before the backend serves requests. Each definition uses `IF NOT EXISTS`, so repeated startup leaves existing schema and data intact. Room creation inserts the room and author participation together.

Implementation areas: `backend/src/db/schemas.ts`, `roomsDb.ts`, `progress.ts`, `backend/src/app.ts`, `shared/api.ts`, `frontend/src/auth/profilePage.tsx`, `frontend/src/hooks/useRoomParticipation.ts`, and `frontend/src/styles/account.css`.

Deploy frontend and backend together. The frontend shows Delete only when `isAuthor === true`; backend ownership checks protect deletion independently.

Acceptance checks for implementation:

1. User A creates a room. The room and A's participant row commit together and it immediately appears in A's profile with derived `isAuthor: true`. Failure to insert the participant row rolls back room creation.
2. Signed-in B opens its question link or overview link. It appears once in B's profile as Participant and once in A's as Author.
3. B reopens, refreshes, or opens two tabs. Join time is retained, last-open advances, and there is only one participant row. The response derives `isAuthor: false` from the room owner.
4. A opens their own room. Recency updates without duplicating it, adding it to the Participant filter, or changing ownership.
5. B has no Delete action. A direct delete request from B returns 404 and preserves the room and every participant row. Signed-out deletion returns 401.
6. A deletes the room. All participant records disappear, active participants are disconnected, and refreshed profiles omit the room.
7. A nonexistent room creates no participant row. A bodyless request for an existing room links it to the authenticated user without any chapter lookup, including when chapter content is unavailable. A participation-registration/deletion race returns a normal unavailable-room response without an orphan record.
8. Anonymous access still works. Signing in and returning saves the current room. Switching accounts never copies the prior account's history.
9. Shared progress and AI billing retain their existing room-wide behavior. Joining or reopening does not alter progress timestamps.
10. Schema initialization succeeds on a fresh database and preserves existing rooms, answers, ownership, and participation on repeated startup.
11. Each account sees only its own participant rows joined to rooms. Sorting uses that account's own timestamps, including the creation-time baseline for author entries.
12. Participation-save failure offers retry; failed list refresh preserves loaded cards. Desktop/mobile, keyboard filters, and deletion confirmation remain usable.
13. Forged ownership or `isAuthor` fields in requests cannot promote a participant or affect ownership. Profile role and deletion authorization consistently use `rooms.owner_user_id`.
14. Two room-creation requests select the same ID. One can commit that ID; the other rolls back on the duplicate, retries with a fresh ID, and creates its own room and author participation together. The existing room and its ownership remain intact.
15. Write contention is handled separately from duplicate IDs. A participant-insert failure or exhausted collision retries leave no partial room/participant creation from failed attempts.
