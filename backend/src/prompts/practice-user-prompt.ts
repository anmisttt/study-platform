import { PracticeQuality, type PracticeItem } from "@study-platform/shared";

export function userPromptForPractice(answer: string, practiceItem: PracticeItem): string {
  if (!practiceItem.solutions.length) throw new Error("No solutions found for practice item");

  const perfectSolution =
    practiceItem.solutions.sort((a, b) => PracticeQuality[b.quality] - PracticeQuality[a.quality])[0].solution;
  

  return `
  {
    "question": "${practiceItem.task}",
    "userAnswer": "${answer}",
    "correctAnswer": "${perfectSolution}",
  }
  `;
}