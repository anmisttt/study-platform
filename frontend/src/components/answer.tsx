import type { PracticeCheckResult, TheoryCheckResult } from "@study-platform/shared";
import FormattedText from "./formattedText";
import type { QuestionItem, ResponseEntry } from "./contest-types";

type AnswerProps = {
  currentItem: QuestionItem;
  response: ResponseEntry;
  onTryAgain: () => void;
};

function Answer({ currentItem, response, onTryAgain }: AnswerProps) {
  return (
    <div className="result-card">
      <p>
        <strong>Rating:</strong> {response.result.rating}/5
      </p>
      <p>
        <strong>Your answer:</strong> {response.answer}
      </p>
      <p>
        <strong>Comment:</strong> {response.result.comment}
      </p>

      {currentItem.type === "theory" ? (
        <div>
          <strong>Valid answer:</strong>
          <FormattedText text={(response.result as TheoryCheckResult).answer} />
        </div>
      ) : (
        <div>
          <strong>Reference solutions:</strong>
          <ul className="solution-list">
            {(response.result as PracticeCheckResult).solutions.map((entry) => (
              <li key={entry.quality}>
                <strong>{entry.quality}:</strong>
                <FormattedText text={entry.solution} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="secondary-button" onClick={onTryAgain}>
        Try again
      </button>
    </div>
  );
}

export default Answer;
