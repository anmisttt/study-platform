import type { Chapter } from "@study-platform/shared";
import { getChapterById } from "../chapters";
import { NotFoundError, UserError } from "../errors";

export function resolveChapter(chapterId: string | null): { chapterId: string; chapter: Chapter } {
  if (!chapterId) {
    throw new UserError("Invalid chapter id.");
  }

  const chapter = getChapterById(chapterId);
  if (!chapter) {
    throw new NotFoundError("Chapter not found.");
  }

  return { chapterId, chapter };
}

export function resolveQuestionIndex(questionId: string | null, notFoundMessage: string): number {
  if (!questionId) {
    throw new UserError("Invalid route params.");
  }

  const index = Number.parseInt(questionId, 10);
  if (!Number.isInteger(index) || index < 0) {
    throw new NotFoundError(notFoundMessage);
  }

  return index;
}
