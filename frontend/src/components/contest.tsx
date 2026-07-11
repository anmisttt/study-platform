import { useEffect, useMemo, useRef, useState } from "react";
import QuestionCard from "./questionCard";
import Timer from "./timer";
import type { ChapterMeta, RoomDetails } from "@study-platform/shared";
import {
  createRoomApiPath,
  MAX_RECORDING_SECONDS,
  type PracticeSolution,
  roomApiPath,
  roomQuestionCheckApiPath,
} from "@study-platform/shared";
import type { ChapterSession, CheckResult, QuestionItem, ResponseEntry } from "./contest-types";
import { flattenItems } from "../utils/questions";
import { resolveAnswerInput } from "../utils/draftStorage";
import { mergeRoomDetailsIntoSession, roomDetailsToChapterSession } from "../utils/room";
import { useCollaborativeDraft } from "../hooks/useCollaborativeDraft";

const ROOM_POLL_INTERVAL_MS = 5000;

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

type ConflictPayload = {
  error?: string;
  room?: RoomDetails;
};

type CheckResponsePayload = CheckResult & {
  revision?: number;
  error?: string;
};

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

function getQuestionSolutions(
  chapterSession: ChapterSession,
  item: QuestionItem | null,
): string | PracticeSolution[] {
  if (!chapterSession.details || !item) {
    return item?.type === "practice" ? [] : "Answer is unavailable for this question.";
  }

  const chapter = chapterSession.details;

  if (item.type === "theory") {
    const theoryItem = chapter.theory[item.questionId];
    if (!theoryItem?.answer?.length) {
      return "Answer is unavailable for this question.";
    }

    return theoryItem.answer;
  }

  const practiceItem = chapter.practice[item.questionId];
  return practiceItem?.solutions ?? [];
}

function fileExtensionFromMimeType(mimeType: string): string {
  const [, subtype = "webm"] = mimeType.split("/");
  const cleanSubtype = subtype.split(";")[0]?.trim().toLowerCase();
  if (!cleanSubtype) {
    return "webm";
  }
  if (cleanSubtype.includes("mpeg")) {
    return "mp3";
  }
  return cleanSubtype;
}

const MAX_RECORDING_MS = MAX_RECORDING_SECONDS * 1000;
// Stop slightly before the hard limit so encoded duration stays under the server cap.
const RECORDING_LIMIT_BUFFER_MS = 1000;
const RECORDING_LIMIT_CHECK_MS = 250;

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
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [recordingSecondsLeft, setRecordingSecondsLeft] = useState<number>(MAX_RECORDING_SECONDS);
  const [roomInput, setRoomInput] = useState<string>(roomId ?? "");
  const [isRoomActionPending, setIsRoomActionPending] = useState<boolean>(false);
  const [startError, setStartError] = useState<string>("");
  const [isEditingLocally, setIsEditingLocally] = useState<boolean>(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingLimitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const items = useMemo(
    () => (chapterSession.details ? flattenItems(chapterSession.details) : []),
    [chapterSession.details],
  );
  const isPracticeMode = Boolean(questionRef);
  const currentIndex = items.length === 0 ? 0 : findQuestionIndex(items, questionRef);
  const currentItem = isPracticeMode ? (items[currentIndex] ?? null) : null;
  const currentResponse = currentItem ? chapterSession.responses[currentItem.id] : null;
  const questionSolutions = getQuestionSolutions(chapterSession, currentItem);
  const collaborativeDraft = useCollaborativeDraft({
    apiBase,
    roomId,
    questionId: currentItem?.id ?? null,
    enabled: isPracticeMode && Boolean(roomId),
  });
  const answerInput = roomId
    ? collaborativeDraft.answerInput
    : currentItem
      ? resolveAnswerInput(roomId, currentItem.id, chapterSession)
      : "";
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
    setRoomInput(roomId ?? "");
  }, [roomId]);

  useEffect(() => {
    if (initialError) {
      setStartError(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    setIsEditingLocally(true);
  }, [currentItem?.id]);

  useEffect(() => {
    if (!collaborativeDraft.isDraftHydrated) {
      return;
    }

    if (currentResponse?.result && collaborativeDraft.answerInput.trim().length === 0) {
      setIsEditingLocally(false);
    }
  }, [
    currentItem?.id,
    currentResponse?.result,
    collaborativeDraft.isDraftHydrated,
    collaborativeDraft.answerInput,
  ]);

  async function fetchRoom(activeRoomId: string): Promise<RoomDetails> {
    if (!chapterMeta) {
      throw new Error("Chapter is unavailable.");
    }

    const res = await fetch(
      `${apiBase}${roomApiPath(activeRoomId)}?chapterId=${encodeURIComponent(chapterMeta.id)}`,
    );
    const payload = (await res.json()) as RoomDetails & { error?: string };
    if (!res.ok) {
      throw new Error(payload.error ?? "Failed to load room.");
    }

    return payload;
  }

  function applyConflictRoom(payload: ConflictPayload): void {
    if (!roomId || !payload.room) {
      return;
    }

    onSessionChange((session) => mergeRoomDetailsIntoSession(session, payload.room!));
  }

  function stopStreamTracks(): void {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function clearRecordingLimitTimer(): void {
    if (recordingLimitIntervalRef.current !== null) {
      clearInterval(recordingLimitIntervalRef.current);
      recordingLimitIntervalRef.current = null;
    }
    recordingStartedAtRef.current = null;
  }

  function startRecordingLimitTimer(): void {
    clearRecordingLimitTimer();
    recordingStartedAtRef.current = Date.now();
    setRecordingSecondsLeft(MAX_RECORDING_SECONDS);

    recordingLimitIntervalRef.current = setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt === null) {
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      const secondsLeft = Math.max(0, MAX_RECORDING_SECONDS - Math.ceil(elapsedMs / 1000));
      setRecordingSecondsLeft(secondsLeft);

      if (elapsedMs >= MAX_RECORDING_MS - RECORDING_LIMIT_BUFFER_MS) {
        stopVoiceRecording();
      }
    }, RECORDING_LIMIT_CHECK_MS);
  }

  function stopVoiceRecording(): void {
    clearRecordingLimitTimer();
    setRecordingSecondsLeft(MAX_RECORDING_SECONDS);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        mediaRecorderRef.current = null;
        stopStreamTracks();
        setIsListening(false);
      }
      return;
    }

    mediaRecorderRef.current = null;
    stopStreamTracks();
    setIsListening(false);
  }

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

  function handleAnswerInputChange(value: string): void {
    if (!currentItem || !roomId) {
      return;
    }

    collaborativeDraft.onAnswerInputChange(value);
  }

  async function syncRoomDetails(activeRoomId: string, options?: { showLoading?: boolean }): Promise<RoomDetails | null> {
    if (!chapterMeta) {
      return null;
    }

    const showLoading = options?.showLoading ?? false;
    if (showLoading) {
      onSessionChange((session) => ({
        ...session,
        loading: true,
        error: "",
      }));
    }

    try {
      const payload = await fetchRoom(activeRoomId);
      onSessionChange((session) => ({
        ...mergeRoomDetailsIntoSession(session, payload),
        loading: false,
        error: "",
      }));
      return payload;
    } catch (error: unknown) {
      const message = errorMessage(error, "Failed to load room.");
      if (showLoading) {
        onSessionChange((session) => ({
          ...session,
          loading: false,
          error: message,
        }));
      }
      return null;
    }
  }

  async function beginPracticeWithRoom(activeRoomId: string): Promise<void> {
    setIsRoomActionPending(true);
    setStartError("");
    try {
      const room = await fetchRoom(activeRoomId);
      const firstItem = flattenItems(roomDetailsToChapterSession(room).details!)[0];
      if (!firstItem) {
        throw new Error("This room has no questions.");
      }

      onQuestionNavigate(firstItem.id, activeRoomId);
    } catch (error: unknown) {
      setStartError(errorMessage(error, "Failed to start practicing."));
    } finally {
      setIsRoomActionPending(false);
    }
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

      await beginPracticeWithRoom(payload.roomId);
    } catch (error: unknown) {
      setStartError(errorMessage(error, "Failed to create room."));
      setIsRoomActionPending(false);
    }
  }

  async function joinExistingRoom(): Promise<void> {
    const trimmedRoomId = roomInput.trim();
    if (!trimmedRoomId) {
      setStartError("Enter a room ID to join.");
      return;
    }

    await beginPracticeWithRoom(trimmedRoomId);
  }

  async function transcribeAudio(itemIdAtStart: string, audioBlob: Blob): Promise<void> {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      const mimeType = audioBlob.type || "audio/webm";
      const extension = fileExtensionFromMimeType(mimeType);
      formData.append("audio", audioBlob, `microphone.${extension}`);
      formData.append("language", (navigator.language || "en").split("-")[0]);

      const res = await fetch(`${apiBase}/transcribe`, {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to transcribe audio.");
      }

      const finalTranscript = payload.text?.trim();
      if (!finalTranscript) {
        return;
      }

      if (!roomId) {
        return;
      }

      collaborativeDraft.appendDraftText(
        finalTranscript,
        chapterSession.responses[itemIdAtStart]?.answer ?? "",
      );
    } catch (error: unknown) {
      window.alert(errorMessage(error, "Failed to transcribe audio."));
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleVoiceInput(): Promise<void> {
    if (!currentItem) {
      return;
    }

    if (isTranscribing) {
      return;
    }

    if (isListening) {
      stopVoiceRecording();
      return;
    }

    const itemIdAtStart = currentItem.id;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.alert("Voice input is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (mediaRecorderRef.current === recorder) {
          mediaRecorderRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        setIsListening(false);
        window.alert("Failed to record audio.");
      };

      recorder.onstop = () => {
        if (mediaRecorderRef.current === recorder) {
          mediaRecorderRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        setIsListening(false);
        const audioBlob = new Blob(audioChunks, {
          type: recorder.mimeType || "audio/webm",
        });
        if (audioBlob.size === 0) {
          return;
        }
        void transcribeAudio(itemIdAtStart, audioBlob);
      };

      mediaRecorderRef.current = recorder;
      setIsListening(true);
      recorder.start();
      startRecordingLimitTimer();
    } catch {
      stopStreamTracks();
      window.alert("Microphone permission is required for voice input.");
    }
  }

  async function handleCheck(): Promise<void> {
    if (!roomId || !currentItem || !answerInput.trim()) {
      return;
    }

    setIsChecking(true);
    const trimmedAnswer = answerInput.trim();
    const baseRevision = chapterSession.revisions[currentItem.id] ?? 0;

    try {
      const endpoint = `${apiBase}${roomQuestionCheckApiPath(roomId, currentItem.type, currentItem.questionId)}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: trimmedAnswer, baseRevision }),
      });

      const payload = (await res.json()) as CheckResponsePayload & ConflictPayload;
      if (res.status === 409) {
        applyConflictRoom(payload);
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
      onSessionChange((session) => {
        const nextDrafts = { ...session.drafts };
        delete nextDrafts[currentItem.id];
        return {
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
          drafts: nextDrafts,
        };
      });
      stopVoiceRecording();
    } catch (error: unknown) {
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
    stopVoiceRecording();
  }

  function handleResetProgress(): void {
    stopVoiceRecording();
    onResetProgress();
  }

  useEffect(() => {
    if (!isPracticeMode || !roomId || !chapterMeta || chapterSession.details || chapterSession.loading) {
      return;
    }

    void syncRoomDetails(roomId, { showLoading: true });
  }, [isPracticeMode, roomId, chapterMeta, chapterSession.details, chapterSession.loading]);

  useEffect(() => {
    if (!isPracticeMode || !roomId || !chapterMeta || !chapterSession.details) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void syncRoomDetails(roomId);
    }, ROOM_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPracticeMode, roomId, chapterMeta, chapterSession.details]);

  useEffect(() => {
    if (!isPracticeMode || !roomId || chapterSession.loading || chapterSession.details || !chapterSession.error) {
      return;
    }

    onRoomAccessError(chapterSession.error);
  }, [isPracticeMode, roomId, chapterSession.loading, chapterSession.details, chapterSession.error, onRoomAccessError]);

  useEffect(() => {
    return () => {
      stopVoiceRecording();
    };
  }, []);

  if (!chapterMeta) {
    return null;
  }

  if (!isPracticeMode) {
    const isBusy = chapterSession.loading || isRoomActionPending;

    return (
      <div className="start-card">
        <h1>{chapterMeta.name}</h1>
        <p>
          {chapterMeta.theoryCount} theory items + {chapterMeta.practiceCount} practice tasks
        </p>
        {chapterSession.loading && <p className="start-card-status">Loading room...</p>}
        {(startError || chapterSession.error) && (
          <p className="error-inline">{startError || chapterSession.error}</p>
        )}

        <div className="start-card-room-panel">
          <form
            className="start-card-room-join-form"
            onSubmit={(event) => {
              event.preventDefault();
              void joinExistingRoom();
            }}
          >
            <input
              type="text"
              className="room-id-input"
              value={roomInput}
              onChange={(event) => setRoomInput(event.target.value)}
              placeholder="Room ID"
              maxLength={6}
              disabled={isBusy}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="submit"
              className="primary-button start-card-button start-card-join"
              disabled={isBusy}
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
            disabled={isBusy}
          >
            Generate a new room
          </button>
        </div>
      </div>
    );
  }

  if (chapterSession.loading || (!chapterSession.details && !chapterSession.error)) {
    return <div className="screen-message">Loading room questions...</div>;
  }

  if (!chapterSession.details) {
    return null;
  }

  if (!currentItem) {
    return null;
  }

  return (
    <div className="practice-layout">
      <div className="practice-header">
        <p className="practice-chapter-number">Chapter {chapterMeta.number}</p>
        <h1 className="practice-chapter-title">{chapterMeta.name}</h1>
        {roomId && (
          <div className="room-id-inline">
            <span>Room ID:</span>
            <code>{roomId}</code>
          </div>
        )}
        <button type="button" className="secondary-button reset-progress-button" onClick={handleResetProgress}>
          Start again
        </button>
      </div>

      <div className="practice-card">
        <div className="progress-row">
          <div className="progress">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`dot ${index === currentIndex ? "active" : ""} ${getDotRatingClass(chapterSession.responses[item.id])}`}
                onClick={() => openQuestion(index)}
                aria-label={`Open question ${index + 1}`}
              />
            ))}
          </div>
          <div className="timer-top-right">
            <Timer
              resetKey={currentItem.id}
              initialSeconds={currentItem.type === "theory" ? 3 * 60 : 10 * 60}
            />
          </div>
        </div>

        <QuestionCard
          currentItem={currentItem}
          response={currentResponse}
          isEditingLocally={isEditingLocally}
          answerInput={answerInput}
          isChecking={isChecking}
          isListening={isListening}
          isTranscribing={isTranscribing}
          recordingSecondsLeft={recordingSecondsLeft}
          solutions={questionSolutions}
          answerTextareaRef={roomId ? collaborativeDraft.textareaRef : undefined}
          onAnswerInputChange={handleAnswerInputChange}
          onVoiceInput={() => {
            void handleVoiceInput();
          }}
          onCheck={handleCheck}
          onTryAgain={handleTryAgain}
        />

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
              width="24"
              height="24"
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
          <button
            type="button"
            className="nav-arrow-button"
            onClick={() => openQuestion(currentIndex + 1)}
            disabled={currentIndex === items.length - 1}
            aria-label="Next question"
            title="Next"
          >
            <svg
              width="24"
              height="24"
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
    </div>
  );
}

export default Contest;
