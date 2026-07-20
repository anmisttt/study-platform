import type { ChapterMeta, RoomDetails } from "@study-platform/shared";
import type { ChapterSession, PracticeQuestionItem, TheoryQuestionItem } from "../components/contest-types";
import { createInitialChapterSession } from "../components/contest-types";
import { mergeRoomDetailsIntoSession } from "../utils/room";

export const API_BASE = "http://localhost/api";

export const chapterMeta: ChapterMeta = {
  id: "first_chapter",
  number: 1,
  name: "Introduction",
  theoryCount: 1,
  practiceCount: 1,
};

export const roomDetails: RoomDetails = {
  roomId: "ABC123",
  chapterId: chapterMeta.id,
  number: chapterMeta.number,
  name: chapterMeta.name,
  theory: [
    {
      question: "What is a process?",
      answer: "An instance of a running program.",
      revision: 0,
    },
  ],
  practice: [
    {
      task: "Implement a counter",
      description: "Write a thread-safe counter.",
      solutions: [{ quality: "good", solution: "Use an atomic integer." }],
      revision: 0,
    },
  ],
};

export const theoryItem: TheoryQuestionItem = {
  id: "theory-0",
  type: "theory",
  questionId: 0,
  title: "Theory 1",
  prompt: "What is a process?",
  details: "",
};

export const practiceItem: PracticeQuestionItem = {
  id: "practice-0",
  type: "practice",
  questionId: 0,
  title: "Practice 1",
  prompt: "Implement a counter",
  details: "Write a thread-safe counter.",
};

export function sessionWithRoom(details: RoomDetails = roomDetails): ChapterSession {
  return {
    ...createInitialChapterSession(),
    ...mergeRoomDetailsIntoSession(createInitialChapterSession(), details),
    loading: false,
    error: "",
  };
}

export function roomDetailsWithAnswer(
  overrides: {
    theoryAnswer?: { answer: string; rating: number; comment: string; revision?: number };
    practiceAnswer?: { answer: string; rating: number; comment: string; revision?: number };
  } = {},
): RoomDetails {
  return {
    ...roomDetails,
    theory: roomDetails.theory.map((item, index) =>
      index === 0 && overrides.theoryAnswer
        ? {
            ...item,
            user_answer: overrides.theoryAnswer.answer,
            rating: overrides.theoryAnswer.rating,
            comment: overrides.theoryAnswer.comment,
            revision: overrides.theoryAnswer.revision ?? 1,
          }
        : item,
    ),
    practice: roomDetails.practice.map((item, index) =>
      index === 0 && overrides.practiceAnswer
        ? {
            ...item,
            user_answer: overrides.practiceAnswer.answer,
            rating: overrides.practiceAnswer.rating,
            comment: overrides.practiceAnswer.comment,
            revision: overrides.practiceAnswer.revision ?? 1,
          }
        : item,
    ),
  };
}
