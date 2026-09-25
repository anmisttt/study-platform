export type QuestionType = "theory" | "practice";

export function formatQuestionRef(type: QuestionType, zeroBasedIndex: number): string {
  return `${type}-${zeroBasedIndex + 1}`;
}

export function parseQuestionRef(ref: string): { type: QuestionType; index: number } | null {
  const match = /^(theory|practice)-([1-9]\d*)$/.exec(ref);
  if (!match) {
    return null;
  }

  return {
    type: match[1] as QuestionType,
    index: Number.parseInt(match[2], 10) - 1,
  };
}

export function roomQuestionCheckApiPath(roomId: string, questionRef: string): string {
  return `/rooms/${roomId}/questions/${questionRef}/check`;
}

export function createRoomApiPath(): string {
  return "/rooms";
}

export function roomsWebSocketBasePath(): string {
  return "/ws/rooms";
}

export function roomWebSocketPath(roomId: string): string {
  return `${roomsWebSocketBasePath()}/${encodeURIComponent(roomId)}`;
}

export function realtimeTranscriptionTokenPath(): string {
  return "/realtime/transcription-token";
}
