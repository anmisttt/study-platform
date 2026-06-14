import { MAX_ANSWER_LENGTH } from "@study-platform/shared";

const ROOM_DRAFTS_STORAGE_KEY = "study-platform.room-drafts";

type RoomDraftsStore = Record<string, Record<string, string>>;

function readStore(): RoomDraftsStore {
  try {
    const raw = localStorage.getItem(ROOM_DRAFTS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as RoomDraftsStore;
  } catch {
    return {};
  }
}

function writeStore(store: RoomDraftsStore): void {
  localStorage.setItem(ROOM_DRAFTS_STORAGE_KEY, JSON.stringify(store));
}

export function getRoomDraft(roomId: string, questionId: string): string | undefined {
  const roomDrafts = readStore()[roomId];
  if (!roomDrafts || !(questionId in roomDrafts)) {
    return undefined;
  }

  return roomDrafts[questionId];
}

export function setRoomDraft(roomId: string, questionId: string, value: string): void {
  const store = readStore();
  const roomDrafts = { ...(store[roomId] ?? {}) };
  roomDrafts[questionId] = value;
  store[roomId] = roomDrafts;
  writeStore(store);
}

export function appendRoomDraft(
  roomId: string,
  questionId: string,
  text: string,
  existingFallback = "",
): string {
  const current = getRoomDraft(roomId, questionId) ?? existingFallback;
  const next = (current ? `${current} ${text}` : text).slice(0, MAX_ANSWER_LENGTH);
  setRoomDraft(roomId, questionId, next);
  return next;
}

export function clearRoomDraft(roomId: string, questionId: string): void {
  const store = readStore();
  const roomDrafts = store[roomId];
  if (!roomDrafts || !(questionId in roomDrafts)) {
    return;
  }

  const nextRoomDrafts = { ...roomDrafts };
  delete nextRoomDrafts[questionId];

  if (Object.keys(nextRoomDrafts).length === 0) {
    delete store[roomId];
  } else {
    store[roomId] = nextRoomDrafts;
  }

  writeStore(store);
}

export function clearRoomDrafts(roomId: string): void {
  const store = readStore();
  delete store[roomId];
  writeStore(store);
}

export function isEditingQuestion(
  roomId: string | null,
  questionId: string,
  session: { drafts: Record<string, string> },
): boolean {
  if (roomId && hasRoomDraft(roomId, questionId)) {
    return true;
  }

  return questionId in session.drafts;
}

export function hasRoomDraft(roomId: string, questionId: string): boolean {
  const roomDrafts = readStore()[roomId];
  return Boolean(roomDrafts && questionId in roomDrafts);
}

export function resolveAnswerInput(
  roomId: string | null,
  questionId: string,
  session: { drafts: Record<string, string>; responses: Record<string, { answer: string }> },
): string {
  if (roomId && hasRoomDraft(roomId, questionId)) {
    return getRoomDraft(roomId, questionId)!;
  }

  if (questionId in session.drafts) {
    return session.drafts[questionId];
  }

  return session.responses[questionId]?.answer ?? "";
}
