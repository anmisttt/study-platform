import { useEffect, useState } from "react";
import type { Chapter } from "@study-platform/shared";
import { chapterDetailsApiPath } from "@study-platform/shared";

const LOAD_ERROR = "Failed to load chapter.";

type ChapterDetailsState = {
  chapterId: string;
  chapter: Chapter | null;
  error: string;
};

export type ChapterDetailsResult = {
  chapter: Chapter | null;
  error: string;
  retry: () => void;
};

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : LOAD_ERROR;
  } catch {
    return LOAD_ERROR;
  }
}

/**
 * Loads a chapter's questions and reference answers, inside or outside a room. The chapter
 * lives only in this hook's state, never in browser storage, so a reload shows current content.
 */
export function useFetchChapterDetails(apiBase: string, chapterId: string, enabled: boolean): ChapterDetailsResult {
  const [state, setState] = useState<ChapterDetailsState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const isActive = enabled && Boolean(chapterId);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const controller = new AbortController();

    async function load(): Promise<void> {
      try {
        const res = await fetch(`${apiBase}${chapterDetailsApiPath(chapterId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(await readErrorMessage(res));
        }
        const chapter = (await res.json()) as Chapter;
        if (controller.signal.aborted) {
          return;
        }
        setState({ chapterId, chapter, error: "" });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        // Network and parse failures carry technical messages; show the generic one.
        const message = error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError)
          ? error.message
          : LOAD_ERROR;
        setState({ chapterId, chapter: null, error: message });
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [apiBase, chapterId, isActive, attempt]);

  function retry(): void {
    setState(null);
    setAttempt((current) => current + 1);
  }

  // Ignore a response that belongs to a previous chapter.
  if (!isActive || state?.chapterId !== chapterId) {
    return { chapter: null, error: "", retry };
  }

  return { chapter: state.chapter, error: state.error, retry };
}
