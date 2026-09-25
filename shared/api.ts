import type { PracticeItem, TheoryItem } from "./domain";

export const MAX_ANSWER_LENGTH = 10000;

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
  hasOwnerLlmKey: boolean;
  chapterId: string;
  number: number;
  name: string;
  theory: RoomTheoryItem[];
  practice: RoomPracticeItem[];
};

export type LlmKeyStatus = { configured: boolean; lastFour: string | null; updatedAt: string | null };
export type UserProfile = {
  id: string;
  email: string;
  llmKey: LlmKeyStatus;
};
export type RoomProgress = {
  checked: number;
  total: number;
  theory: { checked: number; total: number };
  practice: { checked: number; total: number };
  averageScore: number | null;
};
export type RoomParticipationResult = { participationCreated: boolean };
export type ProfileRoomSummary = {
  roomId: string;
  chapterId: string;
  chapterNumber: number;
  chapterName: string;
  createdAt: string;
  updatedAt: string;
  isAuthor: boolean;
  joinedAt: string;
  lastOpenedAt: string;
  progress: RoomProgress;
  continueQuestionRef: string | null;
};
export type ApiErrorResponse = { error: string; code: string; room?: RoomDetails };
