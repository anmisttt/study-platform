import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  buildInsertUpdate,
  decodeAnswerText,
  startRelayServer,
  TestClient,
} from "./testClient";

const ROOM = "room1";
const Q = "practice-0";

let server: Awaited<ReturnType<typeof startRelayServer>>;
let clients: TestClient[] = [];

async function connect(): Promise<TestClient> {
  const client = new TestClient(server.port);
  await client.ready();
  clients.push(client);
  return client;
}

beforeEach(async () => {
  server = await startRelayServer();
  clients = [];
});

afterEach(async () => {
  for (const client of clients) {
    client.close();
  }
  clients = [];
  await server.close();
});

describe("DraftRelay", () => {
  it("responds to subscribe with a snapshot then checking:false", async () => {
    const client = await connect();
    client.subscribe(ROOM, Q);

    const snapshot = await client.waitForType("snapshot");
    expect(snapshot).toMatchObject({ type: "snapshot", roomId: ROOM, questionId: Q });
    expect(typeof snapshot.update).toBe("string");

    const checking = await client.waitForType("checking");
    expect(checking).toMatchObject({ checking: false });
  });

  it("returns an error when updating before subscribing", async () => {
    const client = await connect();
    client.sendUpdate(ROOM, Q, buildInsertUpdate("hello").update);

    const error = await client.waitForType("error");
    expect(error.message).toMatch(/subscribe/i);
  });

  it("returns an error for a binary frame", async () => {
    const client = await connect();
    client.sendRaw(new Uint8Array([1, 2, 3]));

    const error = await client.waitForType("error");
    expect(error.message).toMatch(/binary/i);
  });

  it("returns an error for invalid JSON", async () => {
    const client = await connect();
    client.sendRaw("not json {");

    const error = await client.waitForType("error");
    expect(error.message).toMatch(/invalid/i);
  });

  it("broadcasts an update to peers but does not echo it to the sender", async () => {
    const a = await connect();
    const b = await connect();
    a.subscribe(ROOM, Q);
    b.subscribe(ROOM, Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    const { update } = buildInsertUpdate("hello from A");
    a.sendUpdate(ROOM, Q, update);

    const received = await b.waitForType("update");
    expect(received).toMatchObject({ roomId: ROOM, questionId: Q, update });
    await a.expectNoMessage((message) => message.type === "update");
  });

  it("does not deliver updates across different questions", async () => {
    const a = await connect();
    const b = await connect();
    a.subscribe(ROOM, Q);
    b.subscribe(ROOM, "practice-1");
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    a.sendUpdate(ROOM, Q, buildInsertUpdate("only for Q").update);

    await b.expectNoMessage((message) => message.type === "update");
  });

  it("does not deliver updates across different rooms", async () => {
    const a = await connect();
    const b = await connect();
    a.subscribe(ROOM, Q);
    b.subscribe("room2", Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    a.sendUpdate(ROOM, Q, buildInsertUpdate("only for room1").update);

    await b.expectNoMessage((message) => message.type === "update");
  });

  it("gives a late joiner the current document state via snapshot", async () => {
    const a = await connect();
    a.subscribe(ROOM, Q);
    await a.waitForType("snapshot");
    a.sendUpdate(ROOM, Q, buildInsertUpdate("persisted text").update);

    // Allow the relay to apply the update before the late join.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const b = await connect();
    b.subscribe(ROOM, Q);
    const snapshot = await b.waitForType("snapshot");
    expect(decodeAnswerText(snapshot.update as string)).toBe("persisted text");
  });

  it("converges concurrent updates from two clients", async () => {
    const a = await connect();
    const b = await connect();
    a.subscribe(ROOM, Q);
    b.subscribe(ROOM, Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    const docA = new Y.Doc();
    docA.getText("answer").insert(0, "AAA");
    const docB = new Y.Doc();
    docB.getText("answer").insert(0, "BBB");

    a.sendUpdate(ROOM, Q, Buffer.from(Y.encodeStateAsUpdate(docA)).toString("base64"));
    b.sendUpdate(ROOM, Q, Buffer.from(Y.encodeStateAsUpdate(docB)).toString("base64"));

    const aReceived = await a.waitForType("update");
    const bReceived = await b.waitForType("update");
    Y.applyUpdate(docA, new Uint8Array(Buffer.from(aReceived.update as string, "base64")));
    Y.applyUpdate(docB, new Uint8Array(Buffer.from(bReceived.update as string, "base64")));

    const textA = docA.getText("answer").toString();
    const textB = docB.getText("answer").toString();
    expect(textA).toBe(textB);
    expect(textA).toContain("AAA");
    expect(textA).toContain("BBB");

    // The relay's own doc should match after a fresh subscribe snapshot.
    const c = await connect();
    c.subscribe(ROOM, Q);
    const snapshot = await c.waitForType("snapshot");
    expect(decodeAnswerText(snapshot.update as string)).toBe(textA);
  });

  it("ignores an empty update (nothing is broadcast)", async () => {
    const a = await connect();
    const b = await connect();
    a.subscribe(ROOM, Q);
    b.subscribe(ROOM, Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    a.sendUpdate(ROOM, Q, "");

    await b.expectNoMessage((message) => message.type === "update");
  });

  describe("checking state", () => {
    it("broadcasts checking:true to peers and clears with checking:false", async () => {
      const a = await connect();
      const b = await connect();
      a.subscribe(ROOM, Q);
      b.subscribe(ROOM, Q);
      await a.waitForType("snapshot");
      await b.waitForType("snapshot");
      await a.waitForType("checking");
      await b.waitForType("checking");

      a.sendChecking(ROOM, Q, true);
      const on = await b.waitForType("checking");
      expect(on).toMatchObject({ checking: true });

      a.sendChecking(ROOM, Q, false);
      const off = await b.waitForType("checking");
      expect(off).toMatchObject({ checking: false });
    });

    it("reports checking:true to a newly subscribing client", async () => {
      const a = await connect();
      a.subscribe(ROOM, Q);
      await a.waitForType("snapshot");
      await a.waitForType("checking");
      a.sendChecking(ROOM, Q, true);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const b = await connect();
      b.subscribe(ROOM, Q);
      await b.waitForType("snapshot");
      const checking = await b.waitForType("checking");
      expect(checking).toMatchObject({ checking: true });
    });
  });

  describe("cleanup", () => {
    it("retains the document while at least one subscriber remains", async () => {
      const a = await connect();
      const b = await connect();
      a.subscribe(ROOM, Q);
      b.subscribe(ROOM, Q);
      await a.waitForType("snapshot");
      await b.waitForType("snapshot");
      a.sendUpdate(ROOM, Q, buildInsertUpdate("shared text").update);
      await b.waitForType("update");

      a.close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const c = await connect();
      c.subscribe(ROOM, Q);
      const snapshot = await c.waitForType("snapshot");
      expect(decodeAnswerText(snapshot.update as string)).toBe("shared text");
    });

    it("preserves the document when a lone client re-subscribes to the same question", async () => {
      const a = await connect();
      a.subscribe(ROOM, Q);
      await a.waitForType("snapshot");
      a.sendUpdate(ROOM, Q, buildInsertUpdate("keep me").update);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Re-subscribing to the same question on the same socket must not wipe state.
      a.subscribe(ROOM, Q);
      const snapshot = await a.waitForType("snapshot");
      expect(decodeAnswerText(snapshot.update as string)).toBe("keep me");
    });

    it("discards the document once the last subscriber leaves", async () => {
      const a = await connect();
      a.subscribe(ROOM, Q);
      await a.waitForType("snapshot");
      a.sendUpdate(ROOM, Q, buildInsertUpdate("ephemeral").update);
      await new Promise((resolve) => setTimeout(resolve, 50));
      a.close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const b = await connect();
      b.subscribe(ROOM, Q);
      const snapshot = await b.waitForType("snapshot");
      expect(decodeAnswerText(snapshot.update as string)).toBe("");
    });
  });

  it("stops delivering updates for a question after re-subscribing to another", async () => {
    const a = await connect();
    const b = await connect();
    a.subscribe(ROOM, Q);
    b.subscribe(ROOM, Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    // B moves to another question.
    b.subscribe(ROOM, "practice-9");
    await b.waitForType("snapshot");

    a.sendUpdate(ROOM, Q, buildInsertUpdate("after switch").update);
    await b.expectNoMessage((message) => message.type === "update");
  });
});
