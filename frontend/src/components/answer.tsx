import FormattedText from "./formattedText";
import type { QuestionItem, ResponseEntry } from "./contest-types";

const RATING_META: Record<number, { color: string; label: string }> = {
  1: { color: "#EF4444", label: "Off topic" },
  2: { color: "#F97316", label: "Needs work" },
  3: { color: "#F59E0B", label: "Partial" },
  4: { color: "#22C55E", label: "Good" },
  5: { color: "#10B981", label: "Excellent" },
};

type AnswerProps = {
  currentItem: QuestionItem;
  isEditingLocally: boolean;
  response: ResponseEntry | null;
  answer: string;
  onTryAgain: () => void;
};

function Answer({ currentItem, isEditingLocally, response, answer, onTryAgain }: AnswerProps) {
  const hasResult = Boolean(response?.result);
  const rating = response?.result?.rating;
  const ratingMeta =
    typeof rating === "number" ? RATING_META[Math.max(1, Math.min(5, Math.round(rating)))] : null;

  return (
    <div className="result-card">
      {hasResult && response && ratingMeta && typeof rating === "number" && (
        <>
          <div className="result-rating">
            <div className="result-rating-dots" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className="result-rating-dot"
                  style={{ backgroundColor: n <= rating ? ratingMeta.color : "#E5E7EB" }}
                />
              ))}
            </div>
            <span
              className="result-rating-badge"
              style={{
                backgroundColor: `${ratingMeta.color}20`,
                color: ratingMeta.color,
              }}
            >
              {rating}/5 · {ratingMeta.label}
            </span>
            <span className="visually-hidden">
              <strong>Rating:</strong> {rating}/5
            </span>
          </div>

          <div>
            <strong className="result-section-label">Your answer:</strong>
            <p className="result-your-answer">{response.answer}</p>
          </div>

          <div className="result-comment">
            <strong className="result-section-label">Comment:</strong>
            <p className="result-comment-text">{response.result.comment}</p>
          </div>
        </>
      )}

      <div className="result-reference">
        <strong className="result-section-label">
          {isEditingLocally
            ? "Reference answer:"
            : currentItem.type === "theory"
              ? "Valid answer:"
              : "Reference answer:"}
        </strong>
        <FormattedText text={answer} />
      </div>

      {!isEditingLocally && (
        <button type="button" className="secondary-button try-again-button" onClick={onTryAgain}>
          Try again
        </button>
      )}
    </div>
  );
}

export default Answer;
