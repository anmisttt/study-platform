import type { Chapter, PracticeItem, QuestionType, TheoryItem } from "@study-platform/shared";
import { parseQuestionRef } from "@study-platform/shared";

export type ResolvedChapterQuestion = {
  type: QuestionType;
  index: number;
  item: TheoryItem | PracticeItem;
};

export function resolveChapterQuestion(
  chapter: Chapter,
  questionId: string,
): ResolvedChapterQuestion | null {
  const parsed = parseQuestionRef(questionId);
  if (!parsed) {
    return null;
  }

  const item =
    parsed.type === "theory" ? chapter.theory[parsed.index] : chapter.practice[parsed.index];
  if (!item) {
    return null;
  }

  return {
    type: parsed.type,
    index: parsed.index,
    item,
  };
}
