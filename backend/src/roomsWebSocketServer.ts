import type { Server } from "node:http";
import * as Y from "yjs";
import { WebSocket, WebSocketServer } from "ws";
import {
  DRAFT_YTEXT_NAME,
  type DraftCheckingMessage,
  type DraftClientMessage,
  type DraftServerMessage,
  type DraftUpdateMessage,
  type RoomDetails,
} from "@study-platform/shared";
import { decodeUpdateBase64, encodeUpdateBase64 } from "./wsHelpers/wireCodec";

const EMPTY_SNAPSHOT = encodeUpdateBase64(new Uint8Array());

type DraftKey = string;

function draftKey(roomId: string, questionId: string): DraftKey {
  return `${roomId}:${questionId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseClientMessage(raw: string): DraftClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const message = parsed as Record<string, unknown>;
    if (message.type === "watch_question") {
      if (!isNonEmptyString(message.questionId)) {
        return null;
      }

      return {
        type: "watch_question",
        questionId: message.questionId.trim(),
      };
    }

    if (message.type === "update") {
      if (
        !isNonEmptyString(message.questionId) ||
        typeof message.update !== "string"
      ) {
        return null;
      }

      return {
        type: "update",
        questionId: message.questionId.trim(),
        update: message.update,
      };
    }

    if (message.type === "checking") {
      if (
        !isNonEmptyString(message.questionId) ||
        typeof message.checking !== "boolean"
      ) {
        return null;
      }

      return {
        type: "checking",
        questionId: message.questionId.trim(),
        checking: message.checking,
      };
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

  constructor(
    private readonly loadRoom?: (roomId: string) => RoomDetails,
  ) {}

  broadcastRoomSnapshot(room: RoomDetails): void {
    const subscribers = this.roomSubscribers.get(room.roomId);
    if (!subscribers) {
      return;
    }

    for (const ws of subscribers) {
      sendMessage(ws, { type: "room_snapshot", room });
    }
  }

  attach(server: Server, roomsPath: string): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
      if (!roomIdFromWebSocketUrl(request.url, roomsPath)) {
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

      let roomSnapshot: RoomDetails | undefined;
      if (this.loadRoom) {
        try {
          roomSnapshot = this.loadRoom(roomId);
        } catch (error: unknown) {
          sendMessage(ws, {
            type: "error",
            message: error instanceof Error ? error.message : "Failed to connect to room.",
          });
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

        if (message.type === "watch_question") {
          this.watchQuestion(ws, roomId, message.questionId);
          return;
        }

        if (message.type === "checking") {
          this.handleChecking(ws, roomId, message);
          return;
        }

        this.handleUpdate(ws, roomId, message);
      });

      ws.on("close", () => {
        this.unsubscribeFromQuestion(ws);
        this.unsubscribeFromRoom(ws, roomId);
      });

      if (roomSnapshot) {
        sendMessage(ws, { type: "room_snapshot", room: roomSnapshot });
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

  private watchQuestion(ws: WebSocket, roomId: string, questionId: string): void {
    const key = draftKey(roomId, questionId);
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
      questionId,
      update: snapshot.length > 0 ? encodeUpdateBase64(snapshot) : EMPTY_SNAPSHOT,
    });

    sendMessage(ws, {
      type: "checking",
      questionId,
      checking: this.checkingByKey.get(key) === true,
    });
  }

  private handleChecking(ws: WebSocket, roomId: string, message: DraftCheckingMessage): void {
    const key = draftKey(roomId, message.questionId);
    if (this.socketQuestions.get(ws) !== key) {
      sendMessage(ws, { type: "error", message: "Watch the question before sending question state." });
      return;
    }

    if (message.checking) {
      this.checkingByKey.set(key, true);
    } else {
      this.checkingByKey.delete(key);
    }

    const subscribers = this.questionSubscribers.get(key);
    if (!subscribers) {
      return;
    }

    for (const peer of subscribers) {
      if (peer === ws || peer.readyState !== WebSocket.OPEN) {
        continue;
      }

      sendMessage(peer, {
        type: "checking",
        questionId: message.questionId,
        checking: message.checking,
      });
    }
  }

  private handleUpdate(ws: WebSocket, roomId: string, message: DraftUpdateMessage): void {
    const key = draftKey(roomId, message.questionId);
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
        this.docs.delete(key);
        this.checkingByKey.delete(key);
      }
    }
  }
}
