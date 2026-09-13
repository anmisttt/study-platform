import type { PracticeItem, QuestionType, TheoryItem } from "@study-platform/shared";

type PromptItem = TheoryItem | Pick<PracticeItem, "task" | "question">;

export type TutorEvaluationRequest = {
  itemType: QuestionType;
  question: string;
  userResponse: string;
  referenceAnswer: string;
  llmPrompt: string;
};

function formatQuestion(item: PromptItem): string {
  if ("task" in item) {
    return `${item.task}\n\n${item.question}`;
  }
  return item.question;
}

export function userPromptForItem(answer: string, item: PromptItem): string {
  if ("task" in item) {
    return JSON.stringify(
      {
        item_type: "practice",
        question: formatQuestion(item),
        user_answer: answer,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      item_type: "theory",
      question: formatQuestion(item),
      user_answer: answer,
      reference_answer_example: item.answer,
    },
    null,
    2,
  );
}

export function tutorEvaluationRequestForItem(
  answer: string,
  item: TheoryItem | PracticeItem,
): TutorEvaluationRequest {
  return {
    itemType: "task" in item ? "practice" : "theory",
    question: formatQuestion(item),
    userResponse: answer,
    referenceAnswer: item.answer,
    llmPrompt: userPromptForItem(answer, item),
  };
}
