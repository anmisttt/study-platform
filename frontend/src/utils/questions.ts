import type { Chapter } from "@study-platform/shared";
import type { QuestionItem } from "../components/contest-types";

export function flattenItems(chapter: Chapter): QuestionItem[] {
  const theoryItems: QuestionItem[] = chapter.theory.map((item, index) => ({
    id: `theory-${index}`,
    type: "theory",
    questionId: index,
    title: `Theory ${index + 1}`,
    prompt: item.question,
    details: "",
  }));

  const practiceItems: QuestionItem[] = chapter.practice.map((item, index) => ({
    id: `practice-${index}`,
    type: "practice",
    questionId: index,
    title: `Practice ${index + 1}`,
    prompt: item.task,
    details: item.question,
  }));

  return [...theoryItems, ...practiceItems];
}
