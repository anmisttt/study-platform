import type { Chapter, PracticeCheckResult, TheoryCheckResult } from "@study-platform/shared";

export type { Chapter, ChapterMeta, PracticeCheckResult, TheoryCheckResult } from "@study-platform/shared";

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

export type CheckResult = TheoryCheckResult | PracticeCheckResult;

export type ResponseEntry = {
  answer: string;
  result: CheckResult;
};

export type ChapterSession = {
  details: Chapter | null;
  loading: boolean;
  error: string;
  responses: Record<string, ResponseEntry>;
  drafts: Record<string, string>;
};

export function createInitialChapterSession(): ChapterSession {
  return {
    details: null,
    loading: false,
    error: "",
    responses: {},
    drafts: {},
  };
}
