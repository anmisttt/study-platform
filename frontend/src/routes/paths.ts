export function chaptersPath(): string {
  return "/chapters";
}

export function chapterOverviewPath(chapterId: string, roomId?: string): string {
  const base = `/chapters/${chapterId}/overview`;
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}

export function chapterQuestionPath(chapterId: string, questionRef: string, roomId?: string): string {
  const base = `/chapters/${chapterId}/questions/${questionRef}`;
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}

export function activeChapterIdFromPath(pathname: string): string {
  const match = /^\/chapters\/([^/]+)/.exec(pathname);
  return match?.[1] ?? "";
}

export function roomIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("roomId");
  return value?.trim() ? value.trim() : null;
}
