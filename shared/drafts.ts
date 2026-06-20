export const DRAFT_YTEXT_NAME = "answer";

export type DraftSubscribeMessage = {
  type: "subscribe";
  roomId: string;
  questionId: string;
};

export type DraftUpdateMessage = {
  type: "update";
  roomId: string;
  questionId: string;
  update: string;
};

export type DraftSnapshotMessage = {
  type: "snapshot";
  roomId: string;
  questionId: string;
  update: string;
};

export type DraftErrorMessage = {
  type: "error";
  message: string;
};

export type DraftClientMessage = DraftSubscribeMessage | DraftUpdateMessage;

export type DraftServerMessage = DraftSnapshotMessage | DraftUpdateMessage | DraftErrorMessage;
