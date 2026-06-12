import { useEffect, useMemo, useRef, useState } from "react";
import QuestionCard from "./questionCard";
import Timer from "./timer";
import type { Chapter, ChapterMeta } from "@study-platform/shared";
import {
  chapterQuestionCheckApiPath,
  MAX_ANSWER_LENGTH,
  MAX_RECORDING_SECONDS,
  PracticeQuality,
} from "@study-platform/shared";
import type { ChapterSession, CheckResult, QuestionItem, ResponseEntry } from "./contest-types";
import { flattenItems } from "../utils/questions";

type ContestProps = {
  chapterMeta: ChapterMeta | null;
  chapterSession: ChapterSession;
  apiBase: string;
  questionRef?: string;
  onQuestionNavigate: (questionRef: string) => void;
  onSessionChange: (updater: (session: ChapterSession) => ChapterSession) => void;
  onResetProgress: () => void;
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

function getReferenceAnswer(chapter: Chapter | null, item: QuestionItem | null): string {
  if (!chapter || !item) {
    return "Answer is unavailable for this question.";
  }

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
  questionRef,
  onQuestionNavigate,
  onSessionChange,
  onResetProgress,
}: ContestProps) {
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
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
  const referenceAnswer = getReferenceAnswer(chapterSession.details, currentItem);
  const answerInput = currentItem
    ? chapterSession.drafts[currentItem.id] ?? chapterSession.responses[currentItem.id]?.answer ?? ""
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
    if (items.length === 0) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(index, items.length - 1));
    const nextItem = items[nextIndex];
    if (nextItem) {
      onQuestionNavigate(nextItem.id);
    }
  }

  function handleAnswerInputChange(value: string): void {
    if (!currentItem) {
      return;
    }
    onSessionChange((session) => ({
      ...session,
      drafts: {
        ...session.drafts,
        [currentItem.id]: value.slice(0, MAX_ANSWER_LENGTH),
      },
    }));
  }

  async function loadChapterDetails(): Promise<Chapter | null> {
    if (!chapterMeta) {
      return null;
    }

    if (chapterSession.details) {
      return chapterSession.details;
    }

    onSessionChange((session) => ({
      ...session,
      loading: true,
      error: "",
    }));

    try {
      const res = await fetch(`${apiBase}/chapters/${chapterMeta.id}`);
      if (!res.ok) {
        throw new Error("Failed to load chapter details.");
      }
      const data: Chapter = await res.json();
      onSessionChange((session) => ({
        ...session,
        details: data,
      }));
      return data;
    } catch (error: unknown) {
      onSessionChange((session) => ({
        ...session,
        error: errorMessage(error, "Failed to load chapter details."),
      }));
      return null;
    } finally {
      onSessionChange((session) => ({
        ...session,
        loading: false,
      }));
    }
  }

  async function startPractice(): Promise<void> {
    const details = await loadChapterDetails();
    const firstItem = details ? flattenItems(details)[0] : null;
    if (firstItem) {
      onQuestionNavigate(firstItem.id);
    }
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

      onSessionChange((session) => {
        const existingAnswer = session.drafts[itemIdAtStart] ?? session.responses[itemIdAtStart]?.answer ?? "";
        const nextAnswer = (existingAnswer ? `${existingAnswer} ${finalTranscript}` : finalTranscript).slice(
          0,
          MAX_ANSWER_LENGTH,
        );
        return {
          ...session,
          drafts: {
            ...session.drafts,
            [itemIdAtStart]: nextAnswer,
          },
        };
      });
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
    if (!chapterMeta || !currentItem || !answerInput.trim()) {
      return;
    }

    setIsChecking(true);
    const trimmedAnswer = answerInput.trim();
    try {
      const endpoint = `${apiBase}${chapterQuestionCheckApiPath(chapterMeta.id, currentItem.type, currentItem.questionId)}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: trimmedAnswer }),
      });

      if (!res.ok) {
        throw new Error("Failed to check answer.");
      }

      const result: CheckResult = await res.json();
      onSessionChange((session) => ({
        ...session,
        responses: {
          ...session.responses,
          [currentItem.id]: {
            answer: trimmedAnswer,
            result,
          },
        },
        drafts: {
          ...session.drafts,
          [currentItem.id]: trimmedAnswer,
        },
      }));
      stopVoiceRecording();
    } catch (error: unknown) {
      window.alert(errorMessage(error, "Request failed."));
    } finally {
      setIsChecking(false);
    }
  }

  function handleTryAgain(): void {
    if (!currentItem) {
      return;
    }

    onSessionChange((session) => {
      const nextResponses = { ...session.responses };
      delete nextResponses[currentItem.id];
      return {
        ...session,
        responses: nextResponses,
        drafts: {
          ...session.drafts,
          [currentItem.id]: "",
        },
      };
    });
    stopVoiceRecording();
  }

  function handleResetProgress(): void {
    stopVoiceRecording();
    onResetProgress();
  }

  useEffect(() => {
    if (!questionRef || !chapterMeta || chapterSession.details || chapterSession.loading) {
      return;
    }

    void loadChapterDetails();
  }, [questionRef, chapterMeta, chapterSession.details, chapterSession.loading]);

  useEffect(() => {
    return () => {
      stopVoiceRecording();
    };
  }, []);

  if (!chapterMeta) {
    return null;
  }

  if (!isPracticeMode) {
    return (
      <div className="start-card">
        <h1>{chapterMeta.name}</h1>
        {chapterSession.loading && <p>Loading chapter questions...</p>}
        {chapterSession.error && <p className="error-inline">{chapterSession.error}</p>}
        <p>
          {chapterMeta.theoryCount} theory items + {chapterMeta.practiceCount} practice tasks
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            void startPractice();
          }}
          disabled={chapterSession.loading}
        >
          Start practicing
        </button>
      </div>
    );
  }

  if (chapterSession.loading || !chapterSession.details) {
    return <div className="screen-message">Loading chapter questions...</div>;
  }

  if (!currentItem) {
    return null;
  }

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
          response={currentResponse}
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
