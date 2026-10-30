
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

export type QuestionCheckRequest = {
  answer: string;
  baseRevision: number;
};

/** Indexed by question position; unanswered positions are empty. */
export type RoomChapterAnswers = {
  roomId: string;
  chapterId: string;
  theory: (RoomAnswerFields | null)[];
  practice: (RoomAnswerFields | null)[];
};

export type RoomChapterSummary = {
  chapterId: string;
  number: number;
  name: string;
  checked: number;
  total: number;
};

export type RoomSummary = {
  roomId: string;
  hasOwnerLlmKey: boolean;
  chapters: RoomChapterSummary[];
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
export type ProfileRoomChapter = RoomChapterSummary & {
  progress: RoomProgress;
  /** The lowest-numbered unsolved task (theory before practice), or the first task when all are solved. */
  nextQuestionRef: string;
};

export type ProfileRoomSummary = {
  roomId: string;
  createdAt: string;
  updatedAt: string;
  isAuthor: boolean;
  joinedAt: string;
  lastOpenedAt: string;
  chapters: ProfileRoomChapter[];
  /** The lowest-numbered chapter that still has unsolved tasks (else the first); null for an empty room. */
  activeChapterId: string | null;
  roomProgress: { checked: number; total: number; averageScore: number | null };
  /** The active chapter's next unsolved task; for an empty room, the first task of the first chapter. */
  continue: { chapterNumber: number; questionRef: string } | null;
};
export type ApiErrorResponse = { error: string; code: string; answers?: RoomChapterAnswers };
