import type { Chapter, CheckResult } from "@study-platform/shared";

export type { Chapter, ChapterMeta, CheckResult } from "@study-platform/shared";

export type TheoryQuestionItem = {
  id: string;
  type: "theory";
  questionId: number;
  title: string;
  prompt: string;
  details: string;
};

export type PracticeQuestionItem = {
  id: string;
  type: "practice";
  questionId: number;
  title: string;
  prompt: string;
  details: string;
};

export type QuestionItem = TheoryQuestionItem | PracticeQuestionItem;

export type ResponseEntry = {
  answer: string;
  result: CheckResult;
};

export type ChapterSession = {
  details: Chapter | null;
  responses: Record<string, ResponseEntry>;
  revisions: Record<string, number>;
};

export function createInitialChapterSession(): ChapterSession {
  return {
    details: null,
    responses: {},
    revisions: {},
  };
}
