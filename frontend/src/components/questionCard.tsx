import { MAX_ANSWER_LENGTH, MAX_RECORDING_SECONDS } from "@study-platform/shared";
import { useEffect, useState } from "react";
import Answer from "./answer";
import FormattedText from "./formattedText";
import type { QuestionItem, ResponseEntry } from "./contest-types";

function formatRecordingCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function getCheckButtonTooltip(
  isChecking: boolean,
  answerInput: string,
  isOverAnswerLimit: boolean,
): string | undefined {
  if (isChecking) {
    return "Checking your answer...";
  }

  if (!answerInput.trim()) {
    return "Enter an answer to check.";
  }

  if (isOverAnswerLimit) {
    return `Answer must not exceed ${MAX_ANSWER_LENGTH} characters.`;
  }

  return undefined;
}

type QuestionCardProps = {
  currentItem: QuestionItem;
  response: ResponseEntry | null;
  answerInput: string;
  isChecking: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  referenceAnswer: string;
  onAnswerInputChange: (value: string) => void;
  onVoiceInput: () => void;
  onCheck: () => Promise<void>;
  onTryAgain: () => void;
};

function QuestionCard({
  currentItem,
  response,
  answerInput,
  isChecking,
  isListening,
  isTranscribing,
  referenceAnswer,
  onAnswerInputChange,
  onVoiceInput,
  onCheck,
  onTryAgain,
}: QuestionCardProps) {
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [recordingSecondsLeft, setRecordingSecondsLeft] = useState(MAX_RECORDING_SECONDS);

  useEffect(() => {
    setIsAnswerVisible(false);
  }, [currentItem.id]);

  useEffect(() => {
    if (!isListening) {
      setRecordingSecondsLeft(MAX_RECORDING_SECONDS);
      return;
    }

    setRecordingSecondsLeft(MAX_RECORDING_SECONDS);
    const intervalId = window.setInterval(() => {
      setRecordingSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isListening]);

  const isOverAnswerLimit = answerInput.length > MAX_ANSWER_LENGTH;
  const isCheckDisabled = isChecking || !answerInput.trim() || isOverAnswerLimit;
  const checkButtonTooltip = getCheckButtonTooltip(isChecking, answerInput, isOverAnswerLimit);

  return (
    <>
      <h1>{currentItem.title}</h1>
      <div className="question-context">
        <FormattedText text={currentItem.prompt} className="question" />

        {currentItem.details && (
          <FormattedText text={currentItem.details} className="details" />
        )}
      </div>

      {!response?.result && (
        <div className="answer-box">
          <div className="answer-input-wrap">
            <textarea
              value={answerInput}
              onChange={(event) => onAnswerInputChange(event.target.value)}
              placeholder="Type your answer in any language..."
              rows={5}
            />
            <p className="answer-char-count" aria-live="polite">
              <span className={isOverAnswerLimit ? "answer-char-count-over" : undefined}>
                {answerInput.length}
              </span>{" "}
              / {MAX_ANSWER_LENGTH}
            </p>
          </div>
          <div className="answer-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsAnswerVisible((prev) => !prev)}
            >
              {isAnswerVisible ? "Hide answer" : "Show answer"}
            </button>
            <button
              type="button"
              className={`voice-button ${isListening ? "recording" : ""}`}
              onClick={onVoiceInput}
              disabled={isTranscribing}
              aria-label={isListening ? "Stop microphone" : "Use microphone"}
              title={isTranscribing ? "Transcribing..." : isListening ? "Stop microphone" : "Use microphone"}
            >
              <svg viewBox="0 0 24 24" className="mic-icon" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z"
                />
              </svg>
            </button>
            <span className="check-button-wrap" title={checkButtonTooltip}>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void onCheck();
                }}
                disabled={isCheckDisabled}
              >
                {isChecking ? "Checking..." : "Check"}
              </button>
            </span>
          </div>
          {isAnswerVisible && (
            <div className="answer-preview">
              <p className="answer-preview-title">Correct answer</p>
              <FormattedText text={referenceAnswer} className="answer-preview-text" />
            </div>
          )}
          {isListening && (
            <p className="status-inline" role="status" aria-live="polite">
              Recording... {formatRecordingCountdown(recordingSecondsLeft)} seconds left — tap the microphone again to
              finish.
            </p>
          )}
          {isTranscribing && (
            <p className="status-inline" role="status" aria-live="polite">
              Transcribing...
            </p>
          )}
        </div>
      )}

      {response?.result && <Answer currentItem={currentItem} response={response} onTryAgain={onTryAgain} />}
    </>
  );
}

export default QuestionCard;
