import { useEffect, useMemo, useState } from "react";
import QuestionCard from "./questionCard";
import Timer from "./timer";
import type { ChapterMeta, RoomDetails } from "@study-platform/shared";
import {
  createRoomApiPath,
  formatQuestionRef,
  roomQuestionCheckApiPath,
} from "@study-platform/shared";
import type { ChapterSession, CheckResult, QuestionItem, ResponseEntry } from "./contest-types";
import { flattenItems } from "../utils/questions";
import { mergeRoomDetailsIntoSession } from "../utils/room";
import { useCollaborativeDraft } from "../hooks/useCollaborativeDraft";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";

type ContestProps = {
  chapterMeta: ChapterMeta | null;
  chapterSession: ChapterSession;
  apiBase: string;
  roomId: string | null;
  questionRef?: string;
  initialError?: string;
  onQuestionNavigate: (questionRef: string, roomId: string) => void;
  onRoomAccessError: (message: string) => void;
  onSessionChange: (updater: (session: ChapterSession) => ChapterSession) => void;
  onResetProgress: () => void;
};

type CheckResponsePayload = CheckResult & {
  revision?: number;
  error?: string;
  room?: RoomDetails;
};

type QuestionUiObservation = {
  questionId: string | null;
  isDraftHydrated: boolean;
  isAnswerChecking: boolean;
  answerHasText: boolean;
  hasResult: boolean;
  resultRevision: number;
};

type QuestionUiState = QuestionUiObservation & {
  isEditingLocally: boolean;
  isCheckPending: boolean;
};

function createQuestionUiState(observation: QuestionUiObservation): QuestionUiState {
  return {
    ...observation,
    isEditingLocally: !(
      observation.isDraftHydrated &&
      observation.hasResult &&
      !observation.answerHasText
    ),
    isCheckPending: observation.isAnswerChecking,
  };
}

function reconcileQuestionUiState(
  current: QuestionUiState,
  observation: QuestionUiObservation,
): QuestionUiState {
  if (current.questionId !== observation.questionId) {
    return createQuestionUiState(observation);
  }

  const observationChanged =
    current.isDraftHydrated !== observation.isDraftHydrated ||
    current.isAnswerChecking !== observation.isAnswerChecking ||
    current.answerHasText !== observation.answerHasText ||
    current.hasResult !== observation.hasResult ||
    current.resultRevision !== observation.resultRevision;
  if (!observationChanged) {
    return current;
  }

  let isEditingLocally = current.isEditingLocally;
  let isCheckPending = current.isCheckPending;

  if (!current.isDraftHydrated && observation.isDraftHydrated) {
    isEditingLocally = !(observation.hasResult && !observation.answerHasText);
  }

  if (observation.isAnswerChecking) {
    isCheckPending = true;
  } else if (observation.answerHasText) {
    isCheckPending = false;
  }

  if (
    current.resultRevision !== observation.resultRevision &&
    observation.hasResult &&
    isCheckPending
  ) {
    isCheckPending = false;
    isEditingLocally = false;
  }

  return {
    ...observation,
    isEditingLocally,
    isCheckPending,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getDotRatingClass(response: ResponseEntry | undefined): string {
  const rating = response?.result?.rating;
  if (typeof rating !== "number") {
    return "";
  }

  const normalizedRating = Math.max(1, Math.min(5, Math.round(rating)));
  return `rating-${normalizedRating}`;
}

function getQuestionAnswer(chapterSession: ChapterSession, item: QuestionItem | null): string {
  if (!chapterSession.details || !item) {
    return "Answer is unavailable for this question.";
  }

  const chapter = chapterSession.details;
  const content =
    item.type === "theory"
      ? chapter.theory[item.questionId]
      : chapter.practice[item.questionId];

  return content?.answer?.length
    ? content.answer
    : "Answer is unavailable for this question.";
}

function findQuestionIndex(items: QuestionItem[], questionRef: string | undefined): number {
  if (!questionRef) {
    return 0;
  }

  const index = items.findIndex((item) => item.id === questionRef);
  return index >= 0 ? index : 0;
}

function Contest({
  chapterMeta,
  chapterSession,
  apiBase,
  roomId,
  questionRef,
  initialError = "",
  onQuestionNavigate,
  onRoomAccessError,
  onSessionChange,
  onResetProgress,
}: ContestProps) {
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [roomInputState, setRoomInputState] = useState({
    roomId,
    value: roomId ?? "",
  });
  const [isRoomActionPending, setIsRoomActionPending] = useState<boolean>(false);
  const [startError, setStartError] = useState<string>(initialError);
  const [timerEpoch, setTimerEpoch] = useState(0);
  const roomInput = roomInputState.roomId === roomId ? roomInputState.value : (roomId ?? "");

  const items = useMemo(
    () => (chapterSession.details ? flattenItems(chapterSession.details) : []),
    [chapterSession.details],
  );
  const isPracticeMode = Boolean(questionRef);
  const currentIndex = items.length === 0 ? 0 : findQuestionIndex(items, questionRef);
  const currentItem = isPracticeMode ? (items[currentIndex] ?? null) : null;
  const currentResponse = currentItem ? chapterSession.responses[currentItem.id] : null;
  const questionAnswer = getQuestionAnswer(chapterSession, currentItem);
  const collaborativeDraft = useCollaborativeDraft({
    apiBase,
    roomId,
    questionId: questionRef ?? null,
    enabled: isPracticeMode && Boolean(roomId),
    onRoomSnapshot: (room) => {
      if (room.roomId !== roomId) {
        return;
      }
      if (room.chapterId !== chapterMeta?.id) {
        onRoomAccessError("Room is not for this chapter.");
        return;
      }

      onSessionChange((session) => mergeRoomDetailsIntoSession(session, room));
    },
    onRoomError: onRoomAccessError,
  });
  const {
    isListening,
    isTranscribing,
    toggle: toggleVoiceRecording,
    stop: stopVoiceRecording,
  } = useVoiceRecorder({
    apiBase,
    safetyIdentifier: roomId ?? undefined,
    onTranscript: (text: string) => {
      if (!roomId || !currentItem) {
        return;
      }
      collaborativeDraft.appendDraftText(
        text,
        chapterSession.responses[currentItem.id]?.answer ?? "",
      );
    },
    onError: (message: string) => {
      window.alert(message);
    },
  });
  const answerInput = collaborativeDraft.answerInput;
  const clearLocalAnswerChecking = collaborativeDraft.clearLocalAnswerChecking;
  const questionId = currentItem?.id ?? null;
  const questionUiObservation: QuestionUiObservation = {
    questionId,
    isDraftHydrated: collaborativeDraft.isDraftHydrated,
    isAnswerChecking: collaborativeDraft.isAnswerChecking,
    answerHasText: answerInput.trim().length > 0,
    hasResult: Boolean(currentResponse?.result),
    resultRevision: currentItem && currentResponse?.result
      ? (chapterSession.revisions[currentItem.id] ?? 0)
      : -1,
  };
  const [storedQuestionUi, setStoredQuestionUi] = useState(() =>
    createQuestionUiState(questionUiObservation),
  );
  const questionUi = reconcileQuestionUiState(storedQuestionUi, questionUiObservation);
  if (questionUi !== storedQuestionUi) {
    setStoredQuestionUi(questionUi);
  }
  const { isEditingLocally, isCheckPending } = questionUi;

  function updateQuestionUi(
    update: (current: QuestionUiState) => QuestionUiState,
  ): void {
    setStoredQuestionUi((current) =>
      update(reconcileQuestionUiState(current, questionUiObservation)),
    );
  }

  function setIsEditingLocally(value: boolean): void {
    updateQuestionUi((current) => ({ ...current, isEditingLocally: value }));
  }

  function setIsCheckPending(value: boolean): void {
    updateQuestionUi((current) => ({ ...current, isCheckPending: value }));
  }

  const allAnswered =
    items.length > 0 && items.every((item) => Boolean(chapterSession.responses[item.id]?.result));

  const summary = useMemo(() => {
    const ratings = items
      .map((item) => chapterSession.responses[item.id]?.result?.rating)
      .filter((rating): rating is number => typeof rating === "number");

    if (ratings.length === 0) {
      return { average: 0, total: 0 };
    }

    const total = ratings.reduce((sum, value) => sum + value, 0);
    return { average: total / ratings.length, total };
  }, [items, chapterSession.responses]);

  useEffect(() => {
    if (!currentResponse?.result) {
      return;
    }

    clearLocalAnswerChecking();
  }, [clearLocalAnswerChecking, currentResponse?.result]);

  const isCheckInProgress = isChecking || collaborativeDraft.isAnswerChecking || isCheckPending;

  function openQuestion(index: number): void {
    if (items.length === 0 || !roomId) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(index, items.length - 1));
    const nextItem = items[nextIndex];
    if (nextItem) {
      onQuestionNavigate(nextItem.id, roomId);
    }
  }

  function beginPracticeWithRoom(activeRoomId: string): void {
    if (!chapterMeta) {
      return;
    }

    const firstQuestionRef =
      chapterMeta.theoryCount > 0
        ? formatQuestionRef("theory", 0)
        : chapterMeta.practiceCount > 0
          ? formatQuestionRef("practice", 0)
          : null;
    if (!firstQuestionRef) {
      setStartError("This chapter has no questions.");
      return;
    }

    setStartError("");
    onQuestionNavigate(firstQuestionRef, activeRoomId);
  }

  async function generateNewRoom(): Promise<void> {
    if (!chapterMeta) {
      return;
    }

    setIsRoomActionPending(true);
    setStartError("");
    try {
      const res = await fetch(`${apiBase}${createRoomApiPath()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: chapterMeta.id }),
      });
      const payload = (await res.json()) as { roomId?: string; error?: string };
      if (!res.ok || !payload.roomId) {
        throw new Error(payload.error ?? "Failed to create room.");
      }

      beginPracticeWithRoom(payload.roomId);
    } catch (error: unknown) {
      setStartError(errorMessage(error, "Failed to create room."));
    } finally {
      setIsRoomActionPending(false);
    }
  }

  function joinExistingRoom(): void {
    const trimmedRoomId = roomInput.trim();
    if (!trimmedRoomId) {
      setStartError("Enter a room ID to join.");
      return;
    }

    beginPracticeWithRoom(trimmedRoomId);
  }

  async function handleCheck(): Promise<void> {
    if (!roomId || !currentItem || !answerInput.trim()) {
      return;
    }

    setIsChecking(true);
    setIsCheckPending(true);
    collaborativeDraft.setAnswerChecking(true);
    const trimmedAnswer = answerInput.trim();
    const baseRevision = chapterSession.revisions[currentItem.id] ?? 0;

    try {
      const endpoint = `${apiBase}${roomQuestionCheckApiPath(roomId, currentItem.id)}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: trimmedAnswer, baseRevision }),
      });

      const payload = (await res.json()) as CheckResponsePayload;
      if (res.status === 409) {
        if (payload.room) {
          onSessionChange((session) => mergeRoomDetailsIntoSession(session, payload.room!));
        }
        throw new Error(payload.error ?? "Question was updated by someone else.");
      }
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to check answer.");
      }

      if (typeof payload.revision !== "number") {
        throw new Error("Server did not return answer revision.");
      }

      const nextRevision = payload.revision;
      const checkResult: CheckResult = {
        rating: payload.rating,
        comment: payload.comment,
      };

      collaborativeDraft.clearCollaborativeDraft();
      onSessionChange((session) => ({
        ...session,
        responses: {
          ...session.responses,
          [currentItem.id]: {
            answer: trimmedAnswer,
            result: checkResult,
          },
        },
        revisions: {
          ...session.revisions,
          [currentItem.id]: nextRevision,
        },
      }));
      setIsEditingLocally(false);
      setIsCheckPending(false);
      collaborativeDraft.setAnswerChecking(false);
      stopVoiceRecording();
    } catch (error: unknown) {
      setIsCheckPending(false);
      collaborativeDraft.setAnswerChecking(false);
      window.alert(errorMessage(error, "Request failed."));
    } finally {
      setIsChecking(false);
    }
  }

  function handleTryAgain(): void {
    if (!currentItem || !roomId) {
      return;
    }

    setIsEditingLocally(true);
    setTimerEpoch((epoch) => epoch + 1);
    stopVoiceRecording();
  }

  function handleResetProgress(): void {
    stopVoiceRecording();
    onResetProgress();
  }

  // Stop the realtime session when navigating between questions so a late
  // transcript cannot leak into a different question's draft.
  useEffect(() => {
    stopVoiceRecording();
  }, [currentItem?.id, stopVoiceRecording]);

  if (!chapterMeta) {
    return null;
  }

  if (!isPracticeMode) {
    return (
      <div className="start-card">
        <h1>{chapterMeta.name}</h1>
        <p>
          {chapterMeta.theoryCount} theory items + {chapterMeta.practiceCount} practice tasks
        </p>
        {startError && <p className="error-inline">{startError}</p>}

        <div className="start-card-room-panel">
          <form
            className="start-card-room-join-form"
            onSubmit={(event) => {
              event.preventDefault();
              joinExistingRoom();
            }}
          >
            <input
              type="text"
              className="room-id-input"
              value={roomInput}
              onChange={(event) => {
                setRoomInputState({ roomId, value: event.target.value });
              }}
              placeholder="Room ID..."
              maxLength={6}
              disabled={isRoomActionPending}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="submit"
              className="primary-button start-card-button start-card-join"
              disabled={isRoomActionPending}
            >
              Join room
            </button>
          </form>
          <span className="start-card-room-or" aria-hidden="true">
            or
          </span>
          <button
            type="button"
            className="secondary-button start-card-button start-card-generate"
            onClick={() => {
              void generateNewRoom();
            }}
            disabled={isRoomActionPending}
          >
            Generate new room
          </button>
        </div>
      </div>
    );
  }

  if (!chapterSession.details) {
    return <div className="screen-message">Loading room questions...</div>;
  }

  if (!currentItem) {
    return null;
  }

  const theoryItems = items.filter((item) => item.type === "theory");
  const practiceItems = items.filter((item) => item.type === "practice");

  function renderProgressDot(item: QuestionItem, index: number) {
    return (
      <button
        key={item.id}
        type="button"
        className={`dot ${index === currentIndex ? "active" : ""} ${getDotRatingClass(chapterSession.responses[item.id])}`}
        onClick={() => openQuestion(index)}
        aria-label={`Open question ${index + 1}`}
      />
    );
  }

  return (
    <div className="practice-layout">
      <div className="practice-header">
        <div className="practice-header-spacer" />
        <div className="practice-header-center">
          <p className="practice-chapter-number">Chapter {chapterMeta.number}</p>
          <h1 className="practice-chapter-title">{chapterMeta.name}</h1>
          {roomId && (
            <div className="room-id-inline">
              <span>Room ID:</span>
              <code>{roomId}</code>
            </div>
          )}
          <button type="button" className="reset-progress-button" onClick={handleResetProgress}>
            <svg
              className="reset-progress-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 4v6h6" />
              <path d="M21 20v-6h-6" />
              <path d="M5.5 15a7.5 7.5 0 0 0 12.8 2.2L21 14.5" />
              <path d="M18.5 9A7.5 7.5 0 0 0 5.7 6.8L3 9.5" />
            </svg>
            Start again
          </button>
        </div>
        <div className="practice-header-spacer" />
      </div>

      <div className="practice-card">
        <div className="practice-card-header">
          <div className="progress">
            <div className="progress-group">
              {theoryItems.map((item) => renderProgressDot(item, items.indexOf(item)))}
            </div>
            {practiceItems.length > 0 && (
              <>
                <div className="progress-divider" aria-hidden="true" />
                <div className="progress-group">
                  {practiceItems.map((item) => renderProgressDot(item, items.indexOf(item)))}
                </div>
              </>
            )}
          </div>
          <div className="timer-top-right">
            <Timer
              key={`${currentItem.id}:${timerEpoch}`}
              initialSeconds={currentItem.type === "theory" ? 3 * 60 : 10 * 60}
              paused={!isEditingLocally || isCheckInProgress}
            />
          </div>
        </div>

        <QuestionCard
          currentItem={currentItem}
          response={currentResponse}
          isEditingLocally={isEditingLocally}
          answerInput={answerInput}
          isChecking={isCheckInProgress}
          isListening={isListening}
          isTranscribing={isTranscribing}
          answer={questionAnswer}
          answerTextareaRef={roomId ? collaborativeDraft.textareaRef : undefined}
          onAnswerInputChange={collaborativeDraft.onAnswerInputChange}
          onVoiceInput={toggleVoiceRecording}
          onCheck={handleCheck}
          onTryAgain={handleTryAgain}
        />

        {allAnswered && (
          <div className="summary-card">
            <h3>Summary score</h3>
            <p>
              Total: {summary.total} / {items.length * 5}
            </p>
            <p>Average: {summary.average.toFixed(2)} / 5</p>
          </div>
        )}
      </div>

      <div className="navigation">
        <button
          type="button"
          className="nav-arrow-button"
          onClick={() => openQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
          aria-label="Previous question"
          title="Previous"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <span className="nav-position">
          {currentIndex + 1} / {items.length}
        </span>
        <button
          type="button"
          className="nav-arrow-button"
          onClick={() => openQuestion(currentIndex + 1)}
          disabled={currentIndex === items.length - 1}
          aria-label="Next question"
          title="Next"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Contest;
