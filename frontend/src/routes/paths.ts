import { formatQuestionRef, parseQuestionRef, type ChapterMeta } from "@study-platform/shared";

export function chaptersPath(roomId?: string): string {
  return roomId ? `/chapters?roomId=${encodeURIComponent(roomId)}` : "/chapters";
}

export function chapterOverviewPath(chapterNumber: number, roomId?: string): string {
  const base = `/chapters/${chapterNumber}/overview`;
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}

export function chapterQuestionPath(chapterNumber: number, questionRef: string, roomId?: string): string {
  const base = `/chapters/${chapterNumber}/questions/${questionRef}`;
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}

/** Inside a room, clicking a chapter skips its overview and opens the first task. */
export function chapterEntryPath(chapter: ChapterMeta, roomId?: string): string {
  if (!roomId || chapter.theoryCount + chapter.practiceCount === 0) {
    return chapterOverviewPath(chapter.number, roomId);
  }
  return chapterQuestionPath(chapter.number, formatQuestionRef(chapter.theoryCount > 0 ? "theory" : "practice", 0), roomId);
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

export function roomDestinationLabel(lastPath: string): string {
  const match = /^\/chapters\/(\d+)\/(?:questions\/([^/?]+)|overview)/.exec(lastPath);
  if (!match) return "Chapter list";
  const question = match[2] ? parseQuestionRef(match[2]) : null;
  if (!question) return `Chapter ${match[1]}`;
  return `Chapter ${match[1]} · ${question.type === "practice" ? "Practice" : "Theory"} ${question.index + 1}`;
}
