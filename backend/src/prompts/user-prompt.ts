import type { PracticeItem, TheoryItem } from "@study-platform/shared";

type PromptItem = TheoryItem | PracticeItem;

function formatQuestion(item: PromptItem): string {
  if ("task" in item) {
    return `${item.task}\n\n${item.question}`;
  }
  return item.question;
}

export function userPromptForItem(answer: string, item: PromptItem): string {
  return JSON.stringify(
    {
      item_type: "task" in item ? "practice" : "theory",
      question: formatQuestion(item),
      user_answer: answer,
      reference_answer_example: item.answer,
    },
    null,
    2,
  );
}
