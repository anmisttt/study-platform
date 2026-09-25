import type { RoomDetails } from "./api";

export const DRAFT_YTEXT_NAME = "answer";

export type QuestionWatchMessage = {
  type: "watch_question";
  questionId: string;
};

export type DraftUpdateMessage = {
  type: "update";
  questionId: string;
  update: string;
};

export type DraftSnapshotMessage = {
  type: "snapshot";
  questionId: string;
  update: string;
};

export type DraftCheckingMessage = {
  type: "checking";
  questionId: string;
  checking: boolean;
};

export type RoomSnapshotMessage = {
  type: "room_snapshot";
  room: RoomDetails;
};

export type DraftErrorMessage = {
  type: "error";
  message: string;
};

export type DraftClientMessage =
  | QuestionWatchMessage
  | DraftUpdateMessage;

export type DraftServerMessage =
  | RoomSnapshotMessage
  | DraftSnapshotMessage
  | DraftUpdateMessage
  | DraftCheckingMessage
  | DraftErrorMessage;
