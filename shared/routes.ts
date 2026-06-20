export type QuestionType = "theory" | "practice";

export function formatQuestionRef(type: QuestionType, index: number): string {
  return `${type}-${index}`;
}

export function parseQuestionRef(ref: string): { type: QuestionType; index: number } | null {
  const match = /^(theory|practice)-(\d+)$/.exec(ref);
  if (!match) {
    return null;
  }

  return {
    type: match[1] as QuestionType,
    index: Number.parseInt(match[2], 10),
  };
}

export function roomApiPath(roomId: string): string {
  return `/rooms/${roomId}`;
}

export function roomQuestionCheckApiPath(roomId: string, type: QuestionType, questionIndex: number): string {
  return `/rooms/${roomId}/questions/${type}/${questionIndex}/check`;
}

export function createRoomApiPath(): string {
  return "/rooms";
}

export function roomDraftsWebSocketPath(): string {
  return "/drafts/ws";
}
