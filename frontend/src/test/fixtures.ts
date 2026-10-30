import type { Chapter, ChapterMeta, RoomChapterAnswers } from "@study-platform/shared";
import type { ChapterSession, PracticeQuestionItem, TheoryQuestionItem } from "../components/contest-types";
import { createInitialChapterSession } from "../components/contest-types";
import { mergeRoomAnswersIntoSession } from "../utils/room";

export const API_BASE = "http://localhost/api";

export const chapterMeta: ChapterMeta = {
  id: "first_chapter",
  number: 1,
  name: "Introduction",
  theoryCount: 1,
  practiceCount: 1,
};

export const chapter: Chapter = {
  id: chapterMeta.id,
  number: chapterMeta.number,
  name: chapterMeta.name,
  theory: [
    {
      question: "What is a process?",
      answer: "An instance of a running program.",
    },
  ],
  practice: [
    {
      task: "Implement a counter",
      question: "Write a thread-safe counter.",
      answer: "Use an atomic integer.",
    },
  ],
};

export const roomAnswers: RoomChapterAnswers = {
  roomId: "ABC123",
  chapterId: chapterMeta.id,
  theory: [],
  practice: [],
};

export const theoryItem: TheoryQuestionItem = {
  id: "theory-1",
  type: "theory",
  questionId: 0,
  title: "Theory 1",
  prompt: "What is a process?",
  details: "",
};

export const practiceItem: PracticeQuestionItem = {
  id: "practice-1",
  type: "practice",
  questionId: 0,
  title: "Practice 1",
  prompt: "Implement a counter",
  details: "Write a thread-safe counter.",
};

export function sessionWithRoom(answers: RoomChapterAnswers = roomAnswers): ChapterSession {
  return mergeRoomAnswersIntoSession({ ...createInitialChapterSession(), details: chapter }, answers);
}

type AnswerOverride = { answer: string; rating: number; comment: string; revision?: number };

export function roomAnswersWith(
  overrides: { theoryAnswer?: AnswerOverride; practiceAnswer?: AnswerOverride } = {},
): RoomChapterAnswers {
  const fields = (override: AnswerOverride) => ({
    user_answer: override.answer,
    rating: override.rating,
    comment: override.comment,
    revision: override.revision ?? 1,
  });
  return {
    ...roomAnswers,
    theory: overrides.theoryAnswer ? [fields(overrides.theoryAnswer)] : [],
    practice: overrides.practiceAnswer ? [fields(overrides.practiceAnswer)] : [],
  };
}
