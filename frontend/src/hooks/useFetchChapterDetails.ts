import { useEffect, useState } from "react";
import type { RoomDetails } from "@study-platform/shared";
import { chapterDetailsApiPath } from "@study-platform/shared";
import type { ChapterSession } from "../components/contest-types";
import { createInitialChapterSession } from "../components/contest-types";
import { mergeRoomDetailsIntoSession } from "../utils/room";

const LOAD_ERROR = "Failed to load chapter.";

type ChapterDetailsState = {
  chapterId: string;
  session: ChapterSession | null;
  error: string;
};

export type ChapterDetailsResult = {
  session: ChapterSession | null;
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
 * Loads a chapter's public (roomless, read-only) details. The session lives
 * only in this hook's state: it is never written to room sessions or IndexedDB.
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
        const payload = (await res.json()) as RoomDetails;
        if (controller.signal.aborted) {
          return;
        }
        setState({
          chapterId,
          session: mergeRoomDetailsIntoSession(createInitialChapterSession(), payload),
          error: "",
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        // Network and parse failures carry technical messages; show the generic one.
        const message = error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError)
          ? error.message
          : LOAD_ERROR;
        setState({ chapterId, session: null, error: message });
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
    return { session: null, error: "", retry };
  }

  return { session: state.session, error: state.error, retry };
}
