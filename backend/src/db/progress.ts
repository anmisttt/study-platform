import {
  formatQuestionRef,
  type Chapter,
  type ProfileRoomChapter,
  type ProfileRoomSummary,
  type QuestionType,
  type RoomChapterSummary,
  type RoomProgress,
} from "@study-platform/shared";
import { chapters, getChapterById } from "../chapters.js";
import type { CheckedAnswerRow, ProfileRoomRow } from "./typings.js";

type ChapterRatings = { chapter: Chapter; ratings: Record<QuestionType, (number | undefined)[]> };

/** Answers whose chapter or question left the catalog are dropped. */
function ratingsByChapter(answers: CheckedAnswerRow[]): ChapterRatings[] {
  const byChapter = new Map<string, ChapterRatings>();
  for (const answer of answers) {
    const chapter = getChapterById(answer.chapter_id);
    if (!chapter || answer.question_index >= chapter[answer.question_type].length) continue;
    let entry = byChapter.get(chapter.id);
    if (!entry) {
      entry = { chapter, ratings: { theory: [], practice: [] } };
      byChapter.set(chapter.id, entry);
    }
    entry.ratings[answer.question_type][answer.question_index] = answer.rating;
  }
  return [...byChapter.values()].sort((a, b) => a.chapter.number - b.chapter.number);
}

function scoresOf({ ratings }: ChapterRatings, type?: QuestionType): number[] {
  const values = type ? ratings[type] : [...ratings.theory, ...ratings.practice];
  return values.filter((rating) => rating !== undefined);
}

function totalOf({ chapter }: ChapterRatings): number {
  return chapter.theory.length + chapter.practice.length;
}

function average(scores: number[]): number | null {
  return scores.length ? scores.reduce((sum, rating) => sum + rating, 0) / scores.length : null;
}

function chapterSummary(entry: ChapterRatings): RoomChapterSummary {
  return {
    chapterId: entry.chapter.id,
    number: entry.chapter.number,
    name: entry.chapter.name,
    checked: scoresOf(entry).length,
    total: totalOf(entry),
  };
}

export function roomChapterSummaries(answers: CheckedAnswerRow[]): RoomChapterSummary[] {
  return ratingsByChapter(answers).map(chapterSummary);
}

function chapterProgress(entry: ChapterRatings): RoomProgress {
  return {
    checked: scoresOf(entry).length,
    total: totalOf(entry),
    theory: { checked: scoresOf(entry, "theory").length, total: entry.chapter.theory.length },
    practice: { checked: scoresOf(entry, "practice").length, total: entry.chapter.practice.length },
    averageScore: average(scoresOf(entry)),
  };
}

function firstQuestionRef(chapter: Chapter): string | null {
  return chapter.theory.length ? formatQuestionRef("theory", 0)
    : chapter.practice.length ? formatQuestionRef("practice", 0) : null;
}

function nextUnsolvedRef({ chapter, ratings }: ChapterRatings): string | null {
  for (const type of ["theory", "practice"] as const) {
    const index = chapter[type].findIndex((_, i) => ratings[type][i] === undefined);
    if (index >= 0) return formatQuestionRef(type, index);
  }
  return null;
}

const isoTimestamp = (value: string): string => `${value.replace(" ", "T")}Z`;

export function profileRoomSummary(room: ProfileRoomRow, answers: CheckedAnswerRow[], userId: string): ProfileRoomSummary {
  const entries = ratingsByChapter(answers);
  const roomChapters = entries.map((entry): ProfileRoomChapter => ({
    ...chapterSummary(entry),
    progress: chapterProgress(entry),
    nextQuestionRef: nextUnsolvedRef(entry) ?? firstQuestionRef(entry.chapter)!,
  }));
  const active = roomChapters.find((chapter) => chapter.checked < chapter.total) ?? roomChapters[0];
  const firstChapter = chapters.find((chapter) => firstQuestionRef(chapter) !== null);
  const scores = entries.flatMap((entry) => scoresOf(entry));

  return {
    roomId: room.id,
    createdAt: isoTimestamp(room.created_at),
    updatedAt: isoTimestamp(room.updated_at),
    isAuthor: room.owner_user_id === userId,
    joinedAt: isoTimestamp(room.joined_at),
    lastOpenedAt: isoTimestamp(room.last_opened_at),
    chapters: roomChapters,
    activeChapterId: active?.chapterId ?? null,
    roomProgress: {
      checked: scores.length,
      total: entries.reduce((sum, entry) => sum + totalOf(entry), 0),
      averageScore: average(scores),
    },
    continue: active
      ? { chapterNumber: active.number, questionRef: active.nextQuestionRef }
      : firstChapter ? { chapterNumber: firstChapter.number, questionRef: firstQuestionRef(firstChapter)! } : null,
  };
}
