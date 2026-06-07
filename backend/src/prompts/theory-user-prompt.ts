import type { TheoryItem } from "@study-platform/shared";

export function userPromptForTheory(answer: string, theoryItem: TheoryItem): string {
  return `
  {
    "question": "${theoryItem.question}",
    "userAnswer": "${answer}",
    "correctAnswer": "${theoryItem.answer}",
  }
  `;
}