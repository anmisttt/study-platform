import type { PracticeItem, TheoryItem } from "./domain";

export const MAX_ANSWER_LENGTH = 5000;
export const MAX_RECORDING_SECONDS = 300;

export type CheckResult = {
  rating: number;
  comment: string;
};

export type RoomAnswerFields = {
  user_answer?: string;
  rating?: number;
  comment?: string;
  revision?: number;
};

export type RoomTheoryItem = TheoryItem & RoomAnswerFields;

export type RoomPracticeItem = PracticeItem & RoomAnswerFields;

export type QuestionCheckRequest = {
  answer: string;
  baseRevision: number;
};

export type RoomDetails = {
  roomId: string;
  chapterId: string;
  number: number;
  name: string;
  theory: RoomTheoryItem[];
  practice: RoomPracticeItem[];
};
