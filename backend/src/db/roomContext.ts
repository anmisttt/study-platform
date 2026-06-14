import type { RoomDetails } from "@study-platform/shared";
import { getChapterById } from "../chapters";
import { NotFoundError, UserError } from "../errors";
import type { RoomsDb } from "./roomsDb";
import type { PracticeJson, TheoryJson } from "./typings";

function parseRoomContent(room: { theory: string; practice: string }): {
  theory: TheoryJson[];
  practice: PracticeJson[];
} {
  return {
    theory: JSON.parse(room.theory) as TheoryJson[],
    practice: JSON.parse(room.practice) as PracticeJson[],
  };
}

export function getRoomDetails(roomId: string | null, roomsDb: RoomsDb): RoomDetails {
  if (!roomId) {
    throw new UserError("Invalid room id.");
  }

  const room = roomsDb.getRoom(roomId);
  if (!room) {
    throw new NotFoundError("Room not found.");
  }

  const chapter = getChapterById(room.chapter_id);
  if (!chapter) {
    throw new NotFoundError("Chapter not found for room.");
  }

  const { theory, practice } = parseRoomContent(room);
  return {
    roomId,
    chapterId: chapter.id,
    number: chapter.number,
    name: chapter.name,
    theory,
    practice,
  };
}

export function assertRoomChapter(room: RoomDetails, chapterId: string | null): void {
  if (chapterId && room.chapterId !== chapterId) {
    throw new UserError("Room is not for this chapter.");
  }
}
