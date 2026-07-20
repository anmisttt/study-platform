import { MAX_ANSWER_LENGTH, type PracticeSolution } from "@study-platform/shared";
import { type RefObject, useEffect, useState } from "react";
import Answer from "./answer";
import FormattedText from "./formattedText";
import type { QuestionItem, ResponseEntry } from "./contest-types";

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
  isEditingLocally: boolean;
  answerInput: string;
  isChecking: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  solutions: string | PracticeSolution[];
  answerTextareaRef?: RefObject<HTMLTextAreaElement | null>;
  onAnswerInputChange: (value: string) => void;
  onVoiceInput: () => void;
  onCheck: () => Promise<void>;
  onTryAgain: () => void;
};

function QuestionCard({
  currentItem,
  response,
  isEditingLocally,
  answerInput,
  isChecking,
  isListening,
  isTranscribing,
  solutions,
  answerTextareaRef,
  onAnswerInputChange,
  onVoiceInput,
  onCheck,
  onTryAgain,
}: QuestionCardProps) {
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

  useEffect(() => {
    setIsAnswerVisible(false);
  }, [currentItem.id]);

  const isOverAnswerLimit = answerInput.length > MAX_ANSWER_LENGTH;
  const isCheckDisabled = isChecking || !answerInput.trim() || isOverAnswerLimit;
  const checkButtonTooltip = getCheckButtonTooltip(isChecking, answerInput, isOverAnswerLimit);
  const showAnswer = !isChecking && (isAnswerVisible || (!isEditingLocally && response?.result));
  const showEditor = !isChecking && (isEditingLocally || !response?.result);

  return (
    <>
      <h1>{currentItem.title}</h1>
      <div className="question-context">
        <FormattedText text={currentItem.prompt} className="question" />

        {currentItem.details && (
          <FormattedText text={currentItem.details} className="details" />
        )}
      </div>

      {isChecking && (
        <p className="status-inline checking-status" role="status" aria-live="polite">
          Checking answer...
        </p>
      )}

      {showEditor && (
        <div className="answer-box">
          <div className="answer-input-wrap">
            <textarea
              ref={answerTextareaRef}
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
            <span className="check-button-wrap" title={checkButtonTooltip}>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void onCheck();
                }}
                disabled={isCheckDisabled}
              >
                Check
              </button>
            </span>
            <button
              type="button"
              className={`voice-button ${isListening ? "recording" : ""}`}
              onClick={onVoiceInput}
              disabled={isTranscribing && !isListening}
              aria-label={isListening ? "Stop microphone" : "Use microphone"}
              title={
                isListening
                  ? "Stop microphone"
                  : isTranscribing
                    ? "Transcribing..."
                    : "Use microphone"
              }
            >
              <svg viewBox="0 0 24 24" className="mic-icon" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z"
                />
              </svg>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsAnswerVisible((prev) => !prev)}
            >
              {`${isAnswerVisible ? "Hide" : "Show"} ${response?.result ? "previous" : "reference"} answer`}
            </button>
          </div>
        </div>
      )}

      {showAnswer && (
        <Answer
          currentItem={currentItem}
          isEditingLocally={isEditingLocally}
          response={response}
          solutions={solutions}
          onTryAgain={() => {
            setIsAnswerVisible(false);
            onTryAgain();
          }}
        />
      )}
    </>
  );
}

export default QuestionCard;
