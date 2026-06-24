import type { PracticeSolution } from "@study-platform/shared";
import FormattedText from "./formattedText";
import type { QuestionItem, ResponseEntry } from "./contest-types";

type AnswerProps = {
  currentItem: QuestionItem;
  isEditingLocally: boolean;
  response: ResponseEntry | null;
  solutions: string | PracticeSolution[];
  onTryAgain: () => void;
};

function Answer({ currentItem, isEditingLocally, response, solutions, onTryAgain }: AnswerProps) {
  const hasResult = Boolean(response?.result);

  return (
    <div className="result-card">
      {hasResult && response && (
        <>
          <p>
            <strong>Rating:</strong> {response.result.rating}/5
          </p>
          <p>
            <strong>Your answer:</strong> {response.answer}
          </p>
          <p>
            <strong>Comment:</strong> {response.result.comment}
          </p>
        </>
      )}

      {currentItem.type === "theory" ? (
        <div>
          <strong>Valid answer:</strong>
          <FormattedText text={typeof solutions === "string" ? solutions : ""} />
        </div>
      ) : (
        <div>
          <strong>Reference solutions:</strong>
          <ul className="solution-list">
            {(Array.isArray(solutions) ? solutions : []).map((entry) => (
              <li key={entry.quality}>
                <strong>{entry.quality}:</strong>
                <FormattedText text={entry.solution} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isEditingLocally && (
        <button type="button" className="secondary-button" onClick={onTryAgain}>
          Try again
        </button>
      )}
    </div>
  );
}

export default Answer;
