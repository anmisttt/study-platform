import type { Chapter, RoomDetails } from "@study-platform/shared";
import { getChapterById } from "../chapters.js";
import { NotFoundError, UserError } from "../errors.js";
import { mergePracticeWithAnswers, mergeTheoryWithAnswers } from "./helpers.js";
import type { RoomsDb } from "./roomsDb.js";
import type { AnswerFieldsJson } from "./typings.js";

function parseRoomAnswers(room: { theory_answers: string; practice_answers: string }): {
  theoryAnswers: AnswerFieldsJson[];
  practiceAnswers: AnswerFieldsJson[];
} {
  return {
    theoryAnswers: JSON.parse(room.theory_answers) as AnswerFieldsJson[],
    practiceAnswers: JSON.parse(room.practice_answers) as AnswerFieldsJson[],
  };
}

export function chapterDetails(
  chapter: Chapter,
  room: { roomId: string; hasOwnerLlmKey: boolean; theory_answers: string; practice_answers: string } | null,
): RoomDetails {
  const { theoryAnswers, practiceAnswers } = room ? parseRoomAnswers(room) : { theoryAnswers: [], practiceAnswers: [] };
  return {
    roomId: room?.roomId ?? null,
    hasOwnerLlmKey: room?.hasOwnerLlmKey ?? false,
    chapterId: chapter.id,
    number: chapter.number,
    name: chapter.name,
    theory: mergeTheoryWithAnswers(chapter.theory, theoryAnswers),
    practice: mergePracticeWithAnswers(chapter.practice, practiceAnswers),
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

  return chapterDetails(chapter, { ...room, roomId, hasOwnerLlmKey: roomsDb.hasOwnerLlmKey(roomId) });
}
