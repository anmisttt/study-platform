import type { Server } from "node:http";
import * as Y from "yjs";
import { WebSocket, WebSocketServer } from "ws";
import {
  DRAFT_YTEXT_NAME,
  formatQuestionRef,
  parseQuestionRef,
  type DraftClientMessage,
  type DraftServerMessage,
  type DraftUpdateMessage,
  type RoomChapterAnswers,
  type RoomSummary,
} from "@study-platform/shared";
import { decodeUpdateBase64, encodeUpdateBase64 } from "./wsHelpers/wireCodec.js";

const EMPTY_SNAPSHOT = encodeUpdateBase64(new Uint8Array());

type DraftKey = string;

function draftKey(roomId: string, chapterId: string, questionId: string): DraftKey {
  return `${roomId}:${chapterId}:${questionId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalQuestionRef(value: unknown): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const trimmed = value.trim();
  const parsed = parseQuestionRef(trimmed);
  if (!parsed || formatQuestionRef(parsed.type, parsed.index) !== trimmed) {
    return null;
  }

  return trimmed;
}

export function parseClientMessage(raw: string): DraftClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const message = parsed as Record<string, unknown>;
    if (!isNonEmptyString(message.chapterId)) {
      return null;
    }
    const chapterId = message.chapterId.trim();

    if (message.type === "watch_chapter") {
      return { type: "watch_chapter", chapterId };
    }

    const questionId = canonicalQuestionRef(message.questionId);
    if (!questionId) {
      return null;
    }

    if (message.type === "watch_question") {
      return { type: "watch_question", chapterId, questionId };
    }

    if (message.type === "update" && typeof message.update === "string") {
      return { type: "update", chapterId, questionId, update: message.update };
    }

    return null;
  } catch {
    return null;
  }
}

export function roomIdFromWebSocketUrl(
  requestUrl: string | undefined,
  roomsPath: string,
): string | null {
  if (!requestUrl) {
    return null;
  }

  let pathname: string;
  try {
    pathname = new URL(requestUrl, "http://localhost").pathname;
  } catch {
    return null;
  }

  const prefix = `${roomsPath.replace(/\/$/, "")}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const encodedRoomId = pathname.slice(prefix.length);
  if (!encodedRoomId || encodedRoomId.includes("/")) {
    return null;
  }

  try {
    const roomId = decodeURIComponent(encodedRoomId).trim();
    return roomId || null;
  } catch {
    return null;
  }
}

function sendMessage(ws: WebSocket, message: DraftServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(message));
}

export class RoomsWebSocketServer {
  private readonly docs = new Map<DraftKey, Y.Doc>();
  private readonly checkingByKey = new Map<DraftKey, boolean>();
  private readonly questionSubscribers = new Map<DraftKey, Set<WebSocket>>();
  private readonly roomSubscribers = new Map<string, Set<WebSocket>>();
  private readonly socketQuestions = new WeakMap<WebSocket, DraftKey>();
  private readonly socketChapters = new WeakMap<WebSocket, string>();

  constructor(
    private readonly loaders?: {
      loadSummary: (roomId: string) => RoomSummary;
      loadChapterAnswers: (roomId: string, chapterId: string) => RoomChapterAnswers;
      hasQuestion: (chapterId: string, questionId: string) => boolean;
    },
    private readonly allowedOrigins?: string[],
  ) {}

  broadcastChapterAnswers(answers: RoomChapterAnswers): void {
    for (const ws of this.roomSubscribers.get(answers.roomId) ?? []) {
      if (this.socketChapters.get(ws) === answers.chapterId) {
        sendMessage(ws, { type: "room_snapshot", answers });
      }
    }
  }

  broadcastRoomSummary(summary: RoomSummary): void {
    for (const ws of this.roomSubscribers.get(summary.roomId) ?? []) {
      sendMessage(ws, { type: "room_summary", summary });
    }
  }

  attach(server: Server, roomsPath: string): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
      if ((this.allowedOrigins && (!request.headers.origin || !this.allowedOrigins.includes(request.headers.origin))) || !roomIdFromWebSocketUrl(request.url, roomsPath)) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });

    wss.on("connection", (ws, request) => {
      const roomId = roomIdFromWebSocketUrl(request.url, roomsPath);
      if (!roomId) {
        ws.close(1008, "A room ID is required.");
        return;
      }

      let roomSummary: RoomSummary | undefined;
      if (this.loaders) {
        try {
          roomSummary = this.loaders.loadSummary(roomId);
        } catch (error: unknown) {
          sendMessage(ws, {
            type: "error",
            message: error instanceof Error ? error.message : "Failed to connect to room.",
          });
          ws.close(1008, "Room unavailable");
          return;
        }
      }

      let roomSubscribers = this.roomSubscribers.get(roomId);
      if (!roomSubscribers) {
        roomSubscribers = new Set();
        this.roomSubscribers.set(roomId, roomSubscribers);
      }
      roomSubscribers.add(ws);

      ws.on("message", (data, isBinary) => {
        if (!this.roomSubscribers.get(roomId)?.has(ws) || ws.readyState !== WebSocket.OPEN) return;
        if (isBinary) {
          sendMessage(ws, { type: "error", message: "Binary frames are not supported." });
          return;
        }

        const raw = data.toString();
        const message = parseClientMessage(raw);
        if (!message) {
          sendMessage(ws, { type: "error", message: "Invalid room message." });
          return;
        }

        if (message.type === "watch_chapter") {
          this.watchChapter(ws, roomId, message.chapterId);
          return;
        }

        if (message.type === "watch_question") {
          this.watchQuestion(ws, roomId, message.chapterId, message.questionId);
          return;
        }

        this.handleUpdate(ws, roomId, message);
      });

      ws.on("close", () => {
        this.unsubscribeFromQuestion(ws);
        this.unsubscribeFromRoom(ws, roomId);
      });

      if (roomSummary) {
        sendMessage(ws, { type: "room_summary", summary: roomSummary });
      }
    });

    return wss;
  }

  private getOrCreateDoc(key: DraftKey): Y.Doc {
    let doc = this.docs.get(key);
    if (!doc) {
      doc = new Y.Doc();
      doc.getText(DRAFT_YTEXT_NAME);
      this.docs.set(key, doc);
    }

    return doc;
  }

  private watchChapter(ws: WebSocket, roomId: string, chapterId: string): void {
    if (!this.loaders) {
      this.socketChapters.set(ws, chapterId);
      return;
    }

    try {
      const answers = this.loaders.loadChapterAnswers(roomId, chapterId);
      // Drafts are allowed only in chapters that exist, so clients can't create unbounded docs.
      this.socketChapters.set(ws, chapterId);
      sendMessage(ws, { type: "room_snapshot", answers });
    } catch (error: unknown) {
      sendMessage(ws, { type: "error", message: error instanceof Error ? error.message : "Failed to load the chapter." });
    }
  }

  private watchQuestion(ws: WebSocket, roomId: string, chapterId: string, questionId: string): void {
    if (this.loaders && this.socketChapters.get(ws) !== chapterId) {
      sendMessage(ws, { type: "error", message: "Watch the chapter before its questions." });
      return;
    }
    if (this.loaders && !this.loaders.hasQuestion(chapterId, questionId)) {
      sendMessage(ws, { type: "error", message: "Question not found." });
      return;
    }

    const key = draftKey(roomId, chapterId, questionId);
    // Only tear down the previous subscription when switching to a *different*
    // question. Watching the same question again (e.g. after reconnect setup)
    // must not remove this socket and discard the shared doc as the last leaver.
    if (this.socketQuestions.get(ws) !== key) {
      this.unsubscribeFromQuestion(ws);
    }

    const doc = this.getOrCreateDoc(key);
    let subscribers = this.questionSubscribers.get(key);
    if (!subscribers) {
      subscribers = new Set();
      this.questionSubscribers.set(key, subscribers);
    }

    subscribers.add(ws);
    this.socketQuestions.set(ws, key);

    const snapshot = Y.encodeStateAsUpdate(doc);
    sendMessage(ws, {
      type: "snapshot",
      chapterId,
      questionId,
      update: snapshot.length > 0 ? encodeUpdateBase64(snapshot) : EMPTY_SNAPSHOT,
    });

    sendMessage(ws, {
      type: "checking",
      chapterId,
      questionId,
      checking: this.checkingByKey.get(key) === true,
    });
  }

  setChecking(roomId: string, chapterId: string, questionId: string, checking: boolean): void {
    const key = draftKey(roomId, chapterId, questionId);
    if (checking) this.checkingByKey.set(key, true);
    else this.checkingByKey.delete(key);
    for (const ws of this.questionSubscribers.get(key) ?? []) {
      sendMessage(ws, { type: "checking", chapterId, questionId, checking });
    }
  }

  removeRoom(roomId: string): void {
    for (const ws of this.roomSubscribers.get(roomId) ?? []) {
      sendMessage(ws, { type: "error", message: "This room has been deleted." });
      ws.close(1008, "Room deleted");
    }
    this.roomSubscribers.delete(roomId);
    this.deleteRoomState(roomId);
    for (const key of this.checkingByKey.keys()) {
      if (key.startsWith(`${roomId}:`)) this.checkingByKey.delete(key);
    }
  }

  private handleUpdate(ws: WebSocket, roomId: string, message: DraftUpdateMessage): void {
    const key = draftKey(roomId, message.chapterId, message.questionId);
    if (this.socketQuestions.get(ws) !== key) {
      sendMessage(ws, { type: "error", message: "Watch the question before sending updates." });
      return;
    }

    const update = decodeUpdateBase64(message.update);
    if (update.length === 0) {
      return;
    }

    const doc = this.getOrCreateDoc(key);
    Y.applyUpdate(doc, update);

    const subscribers = this.questionSubscribers.get(key);
    if (!subscribers) {
      return;
    }

    for (const peer of subscribers) {
      if (peer === ws || peer.readyState !== WebSocket.OPEN) {
        continue;
      }

      sendMessage(peer, {
        type: "update",
        chapterId: message.chapterId,
        questionId: message.questionId,
        update: message.update,
      });
    }
  }

  private unsubscribeFromQuestion(ws: WebSocket): void {
    const key = this.socketQuestions.get(ws);
    if (!key) {
      return;
    }

    const subscribers = this.questionSubscribers.get(key);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.questionSubscribers.delete(key);
      }
    }

    this.socketQuestions.delete(ws);
  }

  private unsubscribeFromRoom(ws: WebSocket, roomId: string): void {
    const subscribers = this.roomSubscribers.get(roomId);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.roomSubscribers.delete(roomId);
        this.deleteRoomState(roomId);
      }
    }
  }

  private deleteRoomState(roomId: string): void {
    const prefix = `${roomId}:`;
    for (const key of this.docs.keys()) {
      if (key.startsWith(prefix)) {
        this.docs.get(key)?.destroy();
        this.docs.delete(key);
        this.questionSubscribers.delete(key);
      }
    }
  }
}
