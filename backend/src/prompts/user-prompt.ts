import type { PracticeItem, TheoryItem } from "@study-platform/shared";

type PromptItem = TheoryItem | PracticeItem;

function formatQuestion(item: PromptItem): string {
  if ("task" in item) {
    return `${item.task}\n\n${item.question}`;
  }
  return item.question;
}

export function userPromptForItem(answer: string, item: PromptItem): string {
  return `
  {
    "question": "${formatQuestion(item)}",
    "userAnswer": "${answer}",
    "correctAnswer": "${item.answer}",
  }
  `;
}
