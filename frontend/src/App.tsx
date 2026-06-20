import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import "./styles/App.css";
import Contest from "./components/contest";
import { flattenItems } from "./utils/questions";
import TableOfContents from "./components/table-of-contents";
import { parseQuestionRef, type ChapterMeta } from "@study-platform/shared";
import type { ChapterSession } from "./components/contest-types";
import { createInitialChapterSession } from "./components/contest-types";
import {
  activeChapterIdFromPath,
  chapterOverviewPath,
  chapterQuestionPath,
  chaptersPath,
  roomIdFromSearch,
} from "./routes/paths";
import { clearRoomDraftUpdates } from "./utils/draftStorage";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const GITHUB_REPO_URL = "https://github.com/anmisttt/study-platform";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type ChapterRouteProps = {
  chapters: Map<string, ChapterMeta>;
  roomSessions: Record<string, ChapterSession>;
  roomId: string | null;
  onSessionChange: (roomId: string, updater: (session: ChapterSession) => ChapterSession) => void;
  onResetProgress: (roomId: string) => void;
};

function ChaptersIndexPage() {
  return (
    <div className="chapters-index-page">
      <div className="chapters-index-card">
        <h1 className="chapters-index-message">
          <span className="chapters-index-welcome">Hi! It&apos;s a free platform to practice different SWE topics.</span>
          <span className="chapters-index-lead">To start practicing, select a chapter from the table of contents.</span>
          <a className="chapters-index-github-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" aria-label="View source on GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
              />
            </svg>
          </a>
        </h1>
      </div>
    </div>
  );
}

function ChapterOverviewPage({ chapters, roomSessions, roomId, onSessionChange, onResetProgress }: ChapterRouteProps) {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const chapterMeta = chapterId ? (chapters.get(chapterId) ?? null) : null;
  const roomError = (location.state as { roomError?: string } | null)?.roomError ?? "";

  if (!chapterId || !chapterMeta) {
    return <Navigate to={chaptersPath()} replace />;
  }

  return (
    <Contest
      chapterMeta={chapterMeta}
      chapterSession={roomId ? (roomSessions[roomId] ?? createInitialChapterSession()) : createInitialChapterSession()}
      apiBase={API_BASE}
      roomId={roomId}
      initialError={roomError}
      onQuestionNavigate={(questionRef, activeRoomId) => {
        navigate(chapterQuestionPath(chapterId, questionRef, activeRoomId));
      }}
      onRoomAccessError={(message) => {
        navigate(chapterOverviewPath(chapterId), { replace: true, state: { roomError: message } });
      }}
      onSessionChange={(updater) => {
        if (!roomId) {
          return;
        }
        onSessionChange(roomId, updater);
      }}
      onResetProgress={() => {
        if (!roomId) {
          return;
        }
        onResetProgress(roomId);
      }}
    />
  );
}

function ChapterQuestionPage({ chapters, roomSessions, roomId, onSessionChange, onResetProgress }: ChapterRouteProps) {
  const { chapterId, questionRef } = useParams();
  const navigate = useNavigate();
  const chapterMeta = chapterId ? (chapters.get(chapterId) ?? null) : null;
  const chapterSession = roomId ? (roomSessions[roomId] ?? createInitialChapterSession()) : createInitialChapterSession();
  const items = useMemo(() => (chapterSession.details ? flattenItems(chapterSession.details) : []), [chapterSession.details]);

  useEffect(() => {
    if (!chapterId) {
      return;
    }

    if (!roomId) {
      navigate(chapterOverviewPath(chapterId), {
        replace: true,
        state: { roomError: "A room ID is required to practice." },
      });
      return;
    }

    if (!questionRef || !parseQuestionRef(questionRef)) {
      navigate(chapterOverviewPath(chapterId, roomId), { replace: true });
      return;
    }

    if (items.length > 0 && !items.some((item) => item.id === questionRef)) {
      navigate(chapterOverviewPath(chapterId, roomId), { replace: true });
    }
  }, [chapterId, roomId, questionRef, items, navigate]);

  if (!chapterId || !chapterMeta || !roomId || !questionRef || !parseQuestionRef(questionRef)) {
    return null;
  }

  return (
    <Contest
      key={`${roomId}-${questionRef}`}
      chapterMeta={chapterMeta}
      chapterSession={chapterSession}
      apiBase={API_BASE}
      roomId={roomId}
      questionRef={questionRef}
      onQuestionNavigate={(nextQuestionRef, activeRoomId) => {
        navigate(chapterQuestionPath(chapterId, nextQuestionRef, activeRoomId));
      }}
      onRoomAccessError={(message) => {
        navigate(chapterOverviewPath(chapterId), { replace: true, state: { roomError: message } });
      }}
      onSessionChange={(updater) => {
        onSessionChange(roomId, updater);
      }}
      onResetProgress={() => {
        onResetProgress(roomId);
        navigate(chapterOverviewPath(chapterId, roomId));
      }}
    />
  );
}

function ChapterIdRedirect() {
  const { chapterId } = useParams();
  const location = useLocation();
  const roomId = roomIdFromSearch(location.search);

  if (!chapterId) {
    return <Navigate to={chaptersPath()} replace />;
  }

  return <Navigate to={chapterOverviewPath(chapterId, roomId ?? undefined)} replace />;
}

function App() {
  const [chapters, setChapters] = useState<Map<string, ChapterMeta>>(new Map());
  const [loadingChapters, setLoadingChapters] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [roomSessions, setRoomSessions] = useState<Record<string, ChapterSession>>({});
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeChapterId = activeChapterIdFromPath(location.pathname);
  const roomId = roomIdFromSearch(searchParams.toString());
  const isPracticeRoute = /^\/chapters\/[^/]+\/questions\//.test(location.pathname);

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

  function handleSessionChange(activeRoomId: string, updater: (session: ChapterSession) => ChapterSession): void {
    setRoomSessions((prev) => {
      const currentSession = prev[activeRoomId] ?? createInitialChapterSession();
      return {
        ...prev,
        [activeRoomId]: updater(currentSession),
      };
    });
  }

  function handleResetProgress(activeRoomId: string): void {
    void clearRoomDraftUpdates(activeRoomId);
    setRoomSessions((prev) => {
      const nextSessions = { ...prev };
      delete nextSessions[activeRoomId];
      return nextSessions;
    });
  }

  const routeProps: ChapterRouteProps = {
    chapters,
    roomSessions,
    roomId,
    onSessionChange: handleSessionChange,
    onResetProgress: handleResetProgress,
  };

  if (loadingChapters) {
    return <div className="screen-message">Loading chapters...</div>;
  }

  if (loadError) {
    return <div className="screen-message error">{loadError}</div>;
  }

  return (
    <div className="layout">
      <TableOfContents chapters={chaptersList} activeChapterId={activeChapterId} />

      <main className="content">
        {roomId && isPracticeRoute && (
          <div className="room-id-corner">
            <span>Room ID:</span>
            <code>{roomId}</code>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Navigate to={chaptersPath()} replace />} />
          <Route path="/chapters" element={<ChaptersIndexPage />} />
          <Route path="/chapters/:chapterId" element={<ChapterIdRedirect />} />
          <Route path="/chapters/:chapterId/overview" element={<ChapterOverviewPage {...routeProps} />} />
          <Route path="/chapters/:chapterId/questions/:questionRef" element={<ChapterQuestionPage {...routeProps} />} />
          <Route path="*" element={<Navigate to={chaptersPath()} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
