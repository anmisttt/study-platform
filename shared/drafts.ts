import type { RoomChapterAnswers, RoomSummary } from "./api";

export const DRAFT_YTEXT_NAME = "answer";

export type ChapterWatchMessage = {
  type: "watch_chapter";
  chapterId: string;
};

export type QuestionWatchMessage = {
  type: "watch_question";
  chapterId: string;
  questionId: string;
};

export type DraftUpdateMessage = {
  type: "update";
  chapterId: string;
  questionId: string;
  update: string;
};

export type DraftSnapshotMessage = {
  type: "snapshot";
  chapterId: string;
  questionId: string;
  update: string;
};

export type DraftCheckingMessage = {
  type: "checking";
  chapterId: string;
  questionId: string;
  checking: boolean;
};

export type RoomSnapshotMessage = {
  type: "room_snapshot";
  answers: RoomChapterAnswers;
};

export type RoomSummaryMessage = {
  type: "room_summary";
  summary: RoomSummary;
};

export type DraftErrorMessage = {
  type: "error";
  message: string;
};

export type DraftClientMessage =
  | ChapterWatchMessage
  | QuestionWatchMessage
  | DraftUpdateMessage;

export type DraftServerMessage =
  | RoomSnapshotMessage
  | RoomSummaryMessage
  | DraftSnapshotMessage
  | DraftUpdateMessage
  | DraftCheckingMessage
  | DraftErrorMessage;
