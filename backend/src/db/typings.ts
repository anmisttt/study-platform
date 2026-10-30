import type { QuestionType, RoomChapterAnswers } from "@study-platform/shared";

export type RoomsRow = {
  id: string;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
};

export type ChapterAnswers = Pick<RoomChapterAnswers, "theory" | "practice">;

export type CheckedAnswerRow = {
  room_id: string;
  chapter_id: string;
  question_type: QuestionType;
  question_index: number;
  rating: number;
};

export type ProfileRoomRow = RoomsRow & {
  joined_at: string;
  last_opened_at: string;
};
