import { formatQuestionRef, type ProfileRoomSummary, type RoomAnswerFields } from "@study-platform/shared";
import { getChapterById } from "../chapters.js";
import type { ProfileRoomRow } from "./typings.js";

export function profileRoomSummary(room: ProfileRoomRow, userId: string): ProfileRoomSummary | null {
  const chapter = getChapterById(room.chapter_id);
  if (!chapter) return null;
  const theory = JSON.parse(room.theory_answers) as (RoomAnswerFields | null)[];
  const practice = JSON.parse(room.practice_answers) as (RoomAnswerFields | null)[];
  const checked = (item: RoomAnswerFields | null | undefined): boolean => Boolean(item?.user_answer && typeof item.rating === "number");
  const theoryCount = chapter.theory.filter((_, i) => checked(theory[i])).length;
  const practiceCount = chapter.practice.filter((_, i) => checked(practice[i])).length;
  const ratings = [...theory.slice(0, chapter.theory.length), ...practice.slice(0, chapter.practice.length)]
    .filter(checked).map(item => item!.rating!);
  const firstTheory = chapter.theory.findIndex((_, i) => !checked(theory[i]));
  const firstPractice = chapter.practice.findIndex((_, i) => !checked(practice[i]));
  const continueQuestionRef = firstTheory >= 0 ? formatQuestionRef("theory", firstTheory)
    : firstPractice >= 0 ? formatQuestionRef("practice", firstPractice)
    : chapter.theory.length ? formatQuestionRef("theory", 0)
    : chapter.practice.length ? formatQuestionRef("practice", 0) : null;
  return {
    roomId: room.id, chapterId: chapter.id, chapterNumber: chapter.number, chapterName: chapter.name,
    createdAt: `${room.created_at.replace(" ", "T")}Z`, updatedAt: `${room.updated_at.replace(" ", "T")}Z`,
    isAuthor: room.owner_user_id === userId,
    joinedAt: `${room.joined_at.replace(" ", "T")}Z`,
    lastOpenedAt: `${room.last_opened_at.replace(" ", "T")}Z`,
    continueQuestionRef,
    progress: {
      checked: ratings.length, total: chapter.theory.length + chapter.practice.length,
      theory: { checked: theoryCount, total: chapter.theory.length },
      practice: { checked: practiceCount, total: chapter.practice.length },
      averageScore: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    },
  };
}
