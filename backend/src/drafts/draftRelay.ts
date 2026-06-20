import type { Server } from "node:http";
import * as Y from "yjs";
import { WebSocket, WebSocketServer } from "ws";
import {
  DRAFT_YTEXT_NAME,
  type DraftClientMessage,
  type DraftServerMessage,
  type DraftUpdateMessage,
} from "@study-platform/shared";
import { decodeUpdateBase64, encodeUpdateBase64 } from "./wireCodec";

const EMPTY_SNAPSHOT = encodeUpdateBase64(new Uint8Array());

type DraftKey = string;

function draftKey(roomId: string, questionId: string): DraftKey {
  return `${roomId}:${questionId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseClientMessage(raw: string): DraftClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const message = parsed as Record<string, unknown>;
    if (message.type === "subscribe") {
      if (!isNonEmptyString(message.roomId) || !isNonEmptyString(message.questionId)) {
        return null;
      }

      return {
        type: "subscribe",
        roomId: message.roomId.trim(),
        questionId: message.questionId.trim(),
      };
    }

    if (message.type === "update") {
      if (
        !isNonEmptyString(message.roomId) ||
        !isNonEmptyString(message.questionId) ||
        typeof message.update !== "string"
      ) {
        return null;
      }

      return {
        type: "update",
        roomId: message.roomId.trim(),
        questionId: message.questionId.trim(),
        update: message.update,
      };
    }

    return null;
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

export class DraftRelay {
  private readonly docs = new Map<DraftKey, Y.Doc>();
  private readonly subscribers = new Map<DraftKey, Set<WebSocket>>();
  private readonly socketSubscriptions = new WeakMap<WebSocket, DraftKey>();

  attach(server: Server, path: string): WebSocketServer {
    const wss = new WebSocketServer({ server, path });

    wss.on("connection", (ws) => {
      ws.on("message", (data, isBinary) => {
        if (isBinary) {
          sendMessage(ws, { type: "error", message: "Binary frames are not supported." });
          return;
        }

        const raw = data.toString();
        const message = parseClientMessage(raw);
        if (!message) {
          sendMessage(ws, { type: "error", message: "Invalid draft message." });
          return;
        }

        if (message.type === "subscribe") {
          this.subscribe(ws, message.roomId, message.questionId);
          return;
        }

        this.handleUpdate(ws, message);
      });

      ws.on("close", () => {
        this.unsubscribe(ws);
      });
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

  private subscribe(ws: WebSocket, roomId: string, questionId: string): void {
    const key = draftKey(roomId, questionId);
    this.unsubscribe(ws);

    const doc = this.getOrCreateDoc(key);
    let roomSubscribers = this.subscribers.get(key);
    if (!roomSubscribers) {
      roomSubscribers = new Set();
      this.subscribers.set(key, roomSubscribers);
    }

    roomSubscribers.add(ws);
    this.socketSubscriptions.set(ws, key);

    const snapshot = Y.encodeStateAsUpdate(doc);
    sendMessage(ws, {
      type: "snapshot",
      roomId,
      questionId,
      update: snapshot.length > 0 ? encodeUpdateBase64(snapshot) : EMPTY_SNAPSHOT,
    });
  }

  private handleUpdate(ws: WebSocket, message: DraftUpdateMessage): void {
    const key = draftKey(message.roomId, message.questionId);
    if (this.socketSubscriptions.get(ws) !== key) {
      sendMessage(ws, { type: "error", message: "Subscribe to the question before sending updates." });
      return;
    }

    const update = decodeUpdateBase64(message.update);
    if (update.length === 0) {
      return;
    }

    const doc = this.getOrCreateDoc(key);
    Y.applyUpdate(doc, update);

    const roomSubscribers = this.subscribers.get(key);
    if (!roomSubscribers) {
      return;
    }

    for (const peer of roomSubscribers) {
      if (peer === ws || peer.readyState !== WebSocket.OPEN) {
        continue;
      }

      sendMessage(peer, {
        type: "update",
        roomId: message.roomId,
        questionId: message.questionId,
        update: message.update,
      });
    }
  }

  private unsubscribe(ws: WebSocket): void {
    const key = this.socketSubscriptions.get(ws);
    if (!key) {
      return;
    }

    const roomSubscribers = this.subscribers.get(key);
    if (roomSubscribers) {
      roomSubscribers.delete(ws);
      if (roomSubscribers.size === 0) {
        this.subscribers.delete(key);
        this.docs.delete(key);
      }
    }

    this.socketSubscriptions.delete(ws);
  }
}
