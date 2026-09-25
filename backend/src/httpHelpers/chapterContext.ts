import type { Chapter } from "@study-platform/shared";
import { getChapterById } from "../chapters.js";
import { NotFoundError, UserError } from "../errors.js";

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
