import { useEffect, useMemo, useState } from "react";
import "./styles/App.css";
import Contest from "./components/contest";
import TableOfContests from "./components/table-of-contents";
import type { ChapterMeta } from "@study-platform/shared";
import type { ChapterSession } from "./components/contest-types";
import { createInitialChapterSession } from "./components/contest-types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const CHAPTER_SESSIONS_STORAGE_KEY = "study-platform.chapter-sessions";
const SELECTED_CHAPTER_STORAGE_KEY = "study-platform.selected-chapter-id";
type PersistedChapterSession = Pick<ChapterSession, "isPracticing" | "currentIndex" | "responses" | "drafts">;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function hydrateChapterSessions(rawValue: string): Record<string, ChapterSession> {
  const parsedValue = JSON.parse(rawValue) as unknown;
  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return {};
  }

  return Object.entries(parsedValue).reduce<Record<string, ChapterSession>>((sessions, [chapterId, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return sessions;
    }

    const persistedSession = value as Partial<PersistedChapterSession>;
    sessions[chapterId] = {
      ...createInitialChapterSession(),
      isPracticing: Boolean(persistedSession.isPracticing),
      currentIndex:
        typeof persistedSession.currentIndex === "number" && Number.isInteger(persistedSession.currentIndex)
          ? Math.max(0, persistedSession.currentIndex)
          : 0,
      responses: persistedSession.responses && typeof persistedSession.responses === "object" ? persistedSession.responses : {},
      drafts: persistedSession.drafts && typeof persistedSession.drafts === "object" ? persistedSession.drafts : {},
    };

    return sessions;
  }, {});
}

function App() {
  const [chapters, setChapters] = useState<Map<string, ChapterMeta>>(new Map());
  const [loadingChapters, setLoadingChapters] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>(() => {
    try {
      return localStorage.getItem(SELECTED_CHAPTER_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [chapterSessions, setChapterSessions] = useState<Record<string, ChapterSession>>(() => {
    try {
      const rawValue = localStorage.getItem(CHAPTER_SESSIONS_STORAGE_KEY);
      if (!rawValue) {
        return {};
      }
      return hydrateChapterSessions(rawValue);
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const persistableSessions = Object.entries(chapterSessions).reduce<Record<string, PersistedChapterSession>>(
      (sessions, [chapterId, session]) => {
        sessions[chapterId] = {
          isPracticing: session.isPracticing,
          currentIndex: session.currentIndex,
          responses: session.responses,
          drafts: session.drafts,
        };
        return sessions;
      },
      {},
    );

    localStorage.setItem(CHAPTER_SESSIONS_STORAGE_KEY, JSON.stringify(persistableSessions));
  }, [chapterSessions]);

  useEffect(() => {
    if (!selectedChapterId) {
      localStorage.removeItem(SELECTED_CHAPTER_STORAGE_KEY);
      return;
    }

    localStorage.setItem(SELECTED_CHAPTER_STORAGE_KEY, selectedChapterId);
  }, [selectedChapterId]);

  useEffect(() => {
    let mounted = true;

    async function loadChapters(): Promise<void> {
      try {
        const res = await fetch(`${API_BASE}/chapters`);
        if (!res.ok) {
          throw new Error("Failed to load chapters from backend.");
        }
        const data: ChapterMeta[] = await res.json();
        const chaptersMap = new Map(data.map((chapter) => [chapter.id, chapter]));
        if (mounted) {
          setChapters(chaptersMap);
          if (data.length > 0) {
            const initialChapterId =
              selectedChapterId && chaptersMap.has(selectedChapterId) ? selectedChapterId : data[0].id;
            setSelectedChapterId(initialChapterId);
          }
        }
      } catch (error: unknown) {
        if (mounted) {
          setLoadError(errorMessage(error, "Failed to load chapters."));
        }
      } finally {
        if (mounted) {
          setLoadingChapters(false);
        }
      }
    }

    void loadChapters();

    return () => {
      mounted = false;
    };
  }, []);

  const chaptersList = useMemo(() => Array.from(chapters.values()), [chapters]);

  const selectedChapterMeta = useMemo(() => chapters.get(selectedChapterId) ?? null, [chapters, selectedChapterId]);

  if (loadingChapters) {
    return <div className="screen-message">Loading chapters...</div>;
  }

  if (loadError) {
    return <div className="screen-message error">{loadError}</div>;
  }

  return (
    <div className="layout">
      <TableOfContests
        chapters={chaptersList}
        selectedChapterId={selectedChapterId}
        onSelectChapter={(chapterId) => setSelectedChapterId(chapterId)}
      />

      <main className="content">
        <Contest
          key={selectedChapterId || "empty"}
          chapterMeta={selectedChapterMeta}
          chapterSession={chapterSessions[selectedChapterId] ?? createInitialChapterSession()}
          apiBase={API_BASE}
          onSessionChange={(updater) => {
            if (!selectedChapterId) {
              return;
            }
            setChapterSessions((prev) => {
              const currentSession = prev[selectedChapterId] ?? createInitialChapterSession();
              return {
                ...prev,
                [selectedChapterId]: updater(currentSession),
              };
            });
          }}
          onResetProgress={() => {
            if (!selectedChapterId) {
              return;
            }

            setChapterSessions((prev) => {
              const nextSessions = { ...prev };
              delete nextSessions[selectedChapterId];
              return nextSessions;
            });
          }}
        />
      </main>
    </div>
  );
}

export default App;
