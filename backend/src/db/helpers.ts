import type { PracticeItem, RoomPracticeItem, RoomTheoryItem, TheoryItem } from "@study-platform/shared";
import type { AnswerFieldsJson } from "./typings";

export function answerFieldsForIndex(
  answers: AnswerFieldsJson[],
  index: number,
): Required<Pick<AnswerFieldsJson, "revision">> & AnswerFieldsJson {
  const stored = answers[index];
  return {
    user_answer: stored?.user_answer,
    rating: stored?.rating,
    comment: stored?.comment,
    revision: stored?.revision ?? 0,
  };
}

export function mergeTheoryWithAnswers(
  theory: TheoryItem[],
  answers: AnswerFieldsJson[],
): RoomTheoryItem[] {
  return theory.map((item, index) => ({
    ...item,
    ...answerFieldsForIndex(answers, index),
  }));
}

export function mergePracticeWithAnswers(
  practice: PracticeItem[],
  answers: AnswerFieldsJson[],
): RoomPracticeItem[] {
  return practice.map((item, index) => ({
    ...item,
    ...answerFieldsForIndex(answers, index),
  }));
}
