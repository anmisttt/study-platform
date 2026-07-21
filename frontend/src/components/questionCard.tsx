import { MAX_ANSWER_LENGTH } from "@study-platform/shared";
import { type KeyboardEvent, type RefObject, useEffect, useState } from "react";
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
  answer: string;
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
  answer,
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
  const charRatio = Math.min(1, answerInput.length / MAX_ANSWER_LENGTH);
  const showingInlineReference = isAnswerVisible && showEditor;

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isCheckDisabled) {
        void onCheck();
      }
    }
  }

  return (
    <>
      <div className="practice-card-body">
        <h2 className="question-title">{currentItem.title}</h2>
        <div className="question-context">
          <FormattedText
            text={currentItem.prompt}
            className="question"
            emphasizeFirstParagraph={currentItem.type === "practice"}
          />

          {currentItem.details && (
            <FormattedText text={currentItem.details} className="details" />
          )}
        </div>
      </div>

      <div className="practice-card-answer">
        {isChecking && (
          <p className="status-inline checking-status" role="status" aria-live="polite">
            <svg className="checking-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                fill="currentColor"
                opacity="0.75"
              />
            </svg>
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
                onKeyDown={handleTextareaKeyDown}
                placeholder="Type your answer in any language..."
                rows={currentItem.type === "practice" ? 6 : 5}
              />
              <div className="answer-meta">
                <span className="answer-shortcut-hint">
                  {answerInput.length === 0 ? "⌘ Enter to check" : ""}
                </span>
                <div className="answer-char-meter">
                  <div className="answer-char-bar" aria-hidden="true">
                    <div
                      className={`answer-char-bar-fill${isOverAnswerLimit ? " over" : ""}`}
                      style={{ width: `${charRatio * 100}%` }}
                    />
                  </div>
                  <p className="answer-char-count" aria-live="polite">
                    <span className={isOverAnswerLimit ? "answer-char-count-over" : undefined}>
                      {answerInput.length}
                    </span>
                    /{MAX_ANSWER_LENGTH}
                  </p>
                </div>
              </div>
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
                className="secondary-button reference-toggle-button"
                onClick={() => setIsAnswerVisible((prev) => !prev)}
              >
                {isAnswerVisible ? (
                  <svg
                    className="reference-toggle-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    className="reference-toggle-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
                {`${isAnswerVisible ? "Hide" : "Show"} ${response?.result ? "previous" : "reference"} answer`}
              </button>
            </div>
          </div>
        )}

        {showAnswer && (
          <div className={showingInlineReference ? "reference-panel" : undefined}>
            {showingInlineReference && (
              <div className="reference-panel-header reference-panel-header-collapse-only">
                <button
                  type="button"
                  className="reference-panel-collapse"
                  onClick={() => setIsAnswerVisible(false)}
                >
                  Collapse
                </button>
              </div>
            )}
            <Answer
              currentItem={currentItem}
              isEditingLocally={isEditingLocally}
              response={response}
              answer={answer}
              onTryAgain={() => {
                setIsAnswerVisible(false);
                onTryAgain();
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}

export default QuestionCard;
