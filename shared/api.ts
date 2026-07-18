import type { PracticeItem, TheoryItem } from "./domain";

export const MAX_ANSWER_LENGTH = 5000;
// Per-segment safety cap. Recording length is otherwise unlimited: audio is
// split into segments at natural pauses, and this bounds any single segment
// (and therefore any single upload) so it can't exceed the OpenAI 25 MB limit.
export const MAX_SEGMENT_SECONDS = 60;

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
