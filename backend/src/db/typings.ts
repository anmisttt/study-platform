import type { PracticeSolution } from "@study-platform/shared";

export type RoomsRow = {
  id: string;
  created_at: string;
  updated_at: string;
  chapter_id: string;
  theory: string;
  practice: string;
};

export type AnswerFieldsJson = {
  user_answer?: string;
  rating?: number;
  comment?: string;
  revision?: number;
};

export type TheoryJson = {
  question: string;
  answer: string;
} & AnswerFieldsJson;

export type PracticeJson = {
  task: string;
  description: string;
  solutions: PracticeSolution[];
} & AnswerFieldsJson;
