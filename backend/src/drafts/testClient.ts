import { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { DraftRelay } from "./draftRelay";
import { encodeUpdateBase64 } from "./wireCodec";

const DRAFTS_PATH = "/drafts/ws";

export type ParsedMessage = Record<string, unknown>;

export async function startRelayServer(): Promise<{
  server: Server;
  relay: DraftRelay;
  port: number;
  close: () => Promise<void>;
}> {
  const relay = new DraftRelay();
  const server = createServer();
  relay.attach(server, DRAFTS_PATH);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const port = (server.address() as AddressInfo).port;

  return {
    server,
    relay,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * Thin test wrapper around a real `ws` client that buffers incoming messages
 * and lets a test await the next message matching a predicate. Matched messages
 * are consumed so sequential awaits don't return the same message twice.
 */
export class TestClient {
  private readonly ws: WebSocket;
  private readonly messages: ParsedMessage[] = [];
  private readonly consumed = new Set<number>();
  private readonly openPromise: Promise<void>;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}${DRAFTS_PATH}`);
    this.openPromise = new Promise<void>((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
    });

    this.ws.on("message", (data, isBinary) => {
      if (isBinary) {
        return;
      }
      try {
        this.messages.push(JSON.parse(data.toString()) as ParsedMessage);
      } catch {
        // ignore non-JSON frames in tests
      }
    });
  }

  async ready(): Promise<this> {
    await this.openPromise;
    return this;
  }

  sendRaw(data: string | Uint8Array): void {
    this.ws.send(data);
  }

  send(message: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(message));
  }

  subscribe(roomId: string, questionId: string): void {
    this.send({ type: "subscribe", roomId, questionId });
  }

  sendUpdate(roomId: string, questionId: string, update: string): void {
    this.send({ type: "update", roomId, questionId, update });
  }

  sendChecking(roomId: string, questionId: string, checking: boolean): void {
    this.send({ type: "checking", roomId, questionId, checking });
  }

  async waitFor(
    predicate: (message: ParsedMessage) => boolean,
    timeoutMs = 1500,
  ): Promise<ParsedMessage> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (let index = 0; index < this.messages.length; index += 1) {
        if (this.consumed.has(index)) {
          continue;
        }
        if (predicate(this.messages[index]!)) {
          this.consumed.add(index);
          return this.messages[index]!;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error("Timed out waiting for a matching draft message.");
  }

  waitForType(type: string, timeoutMs?: number): Promise<ParsedMessage> {
    return this.waitFor((message) => message.type === type, timeoutMs);
  }

  async expectNoMessage(
    predicate: (message: ParsedMessage) => boolean,
    windowMs = 250,
  ): Promise<void> {
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
      const match = this.messages.some(
        (message, index) => !this.consumed.has(index) && predicate(message),
      );
      if (match) {
        throw new Error("Received a message that was expected not to arrive.");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  close(): void {
    this.ws.removeAllListeners();
    this.ws.close();
  }
}

/** Build a base64 Yjs update that inserts `text` into a fresh answer doc. */
export function buildInsertUpdate(text: string): { update: string; doc: Y.Doc } {
  const doc = new Y.Doc();
  const ytext = doc.getText("answer");
  ytext.insert(0, text);
  return { update: encodeUpdateBase64(Y.encodeStateAsUpdate(doc)), doc };
}

export function decodeAnswerText(base64: string): string {
  const doc = new Y.Doc();
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.length > 0) {
    Y.applyUpdate(doc, bytes);
  }
  return doc.getText("answer").toString();
}
