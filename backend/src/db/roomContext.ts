import type { RoomDetails } from "@study-platform/shared";
import { getChapterById } from "../chapters";
import { NotFoundError, UserError } from "../errors";
import { mergePracticeWithAnswers, mergeTheoryWithAnswers } from "./helpers";
import type { RoomsDb } from "./roomsDb";
import type { AnswerFieldsJson } from "./typings";

function parseRoomAnswers(room: { theory_answers: string; practice_answers: string }): {
  theoryAnswers: AnswerFieldsJson[];
  practiceAnswers: AnswerFieldsJson[];
} {
  return {
    theoryAnswers: JSON.parse(room.theory_answers) as AnswerFieldsJson[],
    practiceAnswers: JSON.parse(room.practice_answers) as AnswerFieldsJson[],
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

  const { theoryAnswers, practiceAnswers } = parseRoomAnswers(room);
  return {
    roomId,
    chapterId: chapter.id,
    number: chapter.number,
    name: chapter.name,
    theory: mergeTheoryWithAnswers(chapter.theory, theoryAnswers),
    practice: mergePracticeWithAnswers(chapter.practice, practiceAnswers),
  };
}

export function assertRoomChapter(room: RoomDetails, chapterId: string | null): void {
  if (chapterId && room.chapterId !== chapterId) {
    throw new UserError("Room is not for this chapter.");
  }
}
