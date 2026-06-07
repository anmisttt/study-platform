import type { PracticeSolution } from "./domain";

export const MAX_ANSWER_LENGTH = 3000;
export const MAX_RECORDING_SECONDS = 60;

export type TheoryCheckResult = {
  rating: number;
  comment: string;
  answer: string;
};

export type PracticeCheckResult = {
  rating: number;
  comment: string;
  solutions: PracticeSolution[];
};
