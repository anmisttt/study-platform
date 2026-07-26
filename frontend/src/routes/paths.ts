import type { ChapterMeta } from "@study-platform/shared";

export function chaptersPath(): string {
  return "/chapters";
}

export function chapterOverviewPath(chapterNumber: number, roomId?: string): string {
  const base = `/chapters/${chapterNumber}/overview`;
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}

export function chapterQuestionPath(chapterNumber: number, questionRef: string, roomId?: string): string {
  const base = `/chapters/${chapterNumber}/questions/${questionRef}`;
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}

/** Path segment after `/chapters/` — chapter number (canonical) or legacy chapter id. */
export function chapterKeyFromPath(pathname: string): string {
  const match = /^\/chapters\/([^/]+)/.exec(pathname);
  return match?.[1] ?? "";
}

export function resolveChapterMeta(
  chapterKey: string,
  chaptersById: Map<string, ChapterMeta>,
): ChapterMeta | null {
  if (!chapterKey) {
    return null;
  }

  if (/^\d+$/.test(chapterKey)) {
    const chapterNumber = Number(chapterKey);
    for (const chapter of chaptersById.values()) {
      if (chapter.number === chapterNumber) {
        return chapter;
      }
    }
    return null;
  }

  return chaptersById.get(chapterKey) ?? null;
}

/** Canonicalize legacy `/chapters/:id/...` URLs to `/chapters/:number/...`. */
export function canonicalChapterPath(pathname: string, chapter: ChapterMeta): string | null {
  const match = /^\/chapters\/([^/]+)(.*)$/.exec(pathname);
  if (!match) {
    return null;
  }

  const [, chapterKey, rest] = match;
  if (chapterKey === String(chapter.number)) {
    return null;
  }

  return `/chapters/${chapter.number}${rest}`;
}

export function roomIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("roomId");
  return value?.trim() ? value.trim() : null;
}
