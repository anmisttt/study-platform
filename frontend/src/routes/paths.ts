export function chaptersPath(): string {
  return "/chapters";
}

export function chapterOverviewPath(chapterId: string): string {
  return `/chapters/${chapterId}/overview`;
}

export function chapterQuestionPath(chapterId: string, questionRef: string): string {
  return `/chapters/${chapterId}/questions/${questionRef}`;
}

export function activeChapterIdFromPath(pathname: string): string {
  const match = /^\/chapters\/([^/]+)/.exec(pathname);
  return match?.[1] ?? "";
}
