export type RoomsRow = {
  id: string;
  created_at: string;
  updated_at: string;
  chapter_id: string;
  theory?: string;
  practice?: string;
  theory_answers: string;
  practice_answers: string;
};

export type AnswerFieldsJson = {
  user_answer?: string;
  rating?: number;
  comment?: string;
  revision?: number;
};