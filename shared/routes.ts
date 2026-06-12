export type QuestionType = "theory" | "practice";

export function formatQuestionRef(type: QuestionType, index: number): string {
  return `${type}-${index}`;
}

export function parseQuestionRef(ref: string): { type: QuestionType; index: number } | null {
  const match = /^(theory|practice)-(\d+)$/.exec(ref);
  if (!match) {
    return null;
  }

  return {
    type: match[1] as QuestionType,
    index: Number.parseInt(match[2], 10),
  };
}

export function chapterQuestionCheckApiPath(chapterId: string, type: QuestionType, questionIndex: number): string {
  return `/chapters/${chapterId}/questions/${type}/${questionIndex}/check`;
}
