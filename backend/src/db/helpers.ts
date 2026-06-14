import type { PracticeItem, TheoryItem } from "@study-platform/shared";
import type { PracticeJson, TheoryJson } from "./typings";

export function extendWithUserAnswers(block: TheoryItem): TheoryJson;
export function extendWithUserAnswers(block: PracticeItem): PracticeJson;
export function extendWithUserAnswers(block: TheoryItem | PracticeItem): TheoryJson | PracticeJson {
  return {
    ...block,
    user_answer: undefined,
    rating: undefined,
    comment: undefined,
    revision: 0,
  };
}
