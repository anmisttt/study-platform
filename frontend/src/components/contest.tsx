import { useEffect, useMemo, useRef, useState } from "react";
import QuestionCard from "./questionCard";
import Timer from "./timer";
import type { ChapterMeta, RoomDetails } from "@study-platform/shared";
import {
  createRoomApiPath,
  MAX_RECORDING_SECONDS,
  PracticeQuality,
  roomApiPath,
  roomQuestionCheckApiPath,
} from "@study-platform/shared";
import type { ChapterSession, CheckResult, PracticeCheckResult, QuestionItem, ResponseEntry, TheoryCheckResult } from "./contest-types";
import { flattenItems } from "../utils/questions";
import { isEditingQuestion, resolveAnswerInput } from "../utils/draftStorage";
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

function getReferenceAnswer(chapterSession: ChapterSession, item: QuestionItem | null): string {
  if (!chapterSession.details || !item) {
    return "Answer is unavailable for this question.";
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
  if (!practiceItem?.solutions?.length) {
    return "Answer is unavailable for this question.";
  }

  return practiceItem.solutions.sort((a, b) => PracticeQuality[b.quality] - PracticeQuality[a.quality])[0].solution;
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
  const [roomInput, setRoomInput] = useState<string>(roomId ?? "");
  const [isRoomActionPending, setIsRoomActionPending] = useState<boolean>(false);
  const [startError, setStartError] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items = useMemo(
    () => (chapterSession.details ? flattenItems(chapterSession.details) : []),
    [chapterSession.details],
  );
  const isPracticeMode = Boolean(questionRef);
  const currentIndex = items.length === 0 ? 0 : findQuestionIndex(items, questionRef);
  const currentItem = isPracticeMode ? (items[currentIndex] ?? null) : null;
  const currentResponse = currentItem ? chapterSession.responses[currentItem.id] : null;
  const referenceAnswer = getReferenceAnswer(chapterSession, currentItem);
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

  function clearRecordingLimitTimeout(): void {
    if (recordingLimitTimeoutRef.current !== null) {
      clearTimeout(recordingLimitTimeoutRef.current);
      recordingLimitTimeoutRef.current = null;
    }
  }

  function stopVoiceRecording(): void {
    clearRecordingLimitTimeout();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
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
        mediaRecorderRef.current = null;
        stopStreamTracks();
        setIsListening(false);
        window.alert("Failed to record audio.");
      };

      recorder.onstop = () => {
        mediaRecorderRef.current = null;
        stopStreamTracks();
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
      recordingLimitTimeoutRef.current = setTimeout(() => {
        recordingLimitTimeoutRef.current = null;
        stopVoiceRecording();
      }, MAX_RECORDING_MS);
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
      const checkResult: CheckResult =
        currentItem.type === "theory"
          ? {
              rating: payload.rating,
              comment: payload.comment,
              answer: (payload as TheoryCheckResult).answer,
            }
          : {
              rating: payload.rating,
              comment: payload.comment,
              solutions: (payload as PracticeCheckResult).solutions,
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

    collaborativeDraft.clearCollaborativeDraft();
    onSessionChange((session) => ({
      ...session,
      drafts: {
        ...session.drafts,
        [currentItem.id]: "",
      },
    }));
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
            Generate new room
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

  const isEditingLocally =
    roomId && currentItem
      ? isEditingQuestion(roomId, currentItem.id, chapterSession) || collaborativeDraft.answerInput.trim().length > 0
      : false;
  const showCheckedAnswer = Boolean(currentResponse?.result) && !isEditingLocally;

  return (
    <div className="practice-layout">
      <div className="practice-header">
        <p className="practice-chapter-number">Chapter {chapterMeta.number}</p>
        <h1 className="practice-chapter-title">{chapterMeta.name}</h1>
        <button type="button" className="secondary-button reset-progress-button" onClick={handleResetProgress}>
          Reset progress
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
          response={showCheckedAnswer ? currentResponse : null}
          answerInput={answerInput}
          isChecking={isChecking}
          isListening={isListening}
          isTranscribing={isTranscribing}
          referenceAnswer={referenceAnswer}
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
            className="secondary-button"
            onClick={() => openQuestion(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => openQuestion(currentIndex + 1)}
            disabled={currentIndex === items.length - 1}
          >
            Next
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
