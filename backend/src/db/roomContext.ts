import type { RoomChapterAnswers, RoomSummary } from "@study-platform/shared";
import { getChapterById } from "../chapters.js";
import { NotFoundError, UserError } from "../errors.js";
import { roomChapterSummaries } from "./progress.js";
import type { RoomsDb } from "./roomsDb.js";

function requireRoom(roomId: string | null, roomsDb: RoomsDb): string {
  if (!roomId) {
    throw new UserError("Invalid room id.");
  }

  if (!roomsDb.getRoom(roomId)) {
    throw new NotFoundError("Room not found.");
  }

  return roomId;
}

export function getRoomSummary(roomId: string | null, roomsDb: RoomsDb): RoomSummary {
  const id = requireRoom(roomId, roomsDb);
  return {
    roomId: id,
    hasOwnerLlmKey: roomsDb.hasOwnerLlmKey(id),
    chapters: roomChapterSummaries(roomsDb.listCheckedAnswers(id)),
  };
}

export function getRoomChapterAnswers(roomId: string | null, chapterId: string, roomsDb: RoomsDb): RoomChapterAnswers {
  const id = requireRoom(roomId, roomsDb);
  if (!getChapterById(chapterId)) {
    throw new NotFoundError("Chapter not found.");
  }

  return { roomId: id, chapterId, ...roomsDb.getChapterAnswers(id, chapterId) };
}
