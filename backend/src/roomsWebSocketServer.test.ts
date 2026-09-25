import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { RoomDetails } from "@study-platform/shared";
import {
  buildInsertUpdate,
  decodeAnswerText,
  startRoomsWebSocketServer,
  TestClient,
} from "./wsHelpers/testClient.js";

const ROOM = "room1";
const Q = "practice-1";
const roomDetails: RoomDetails = {
  hasOwnerLlmKey: false,
  roomId: ROOM,
  chapterId: "chapter-1",
  number: 1,
  name: "Chapter 1",
  theory: [],
  practice: [],
};

let server: Awaited<ReturnType<typeof startRoomsWebSocketServer>>;
let clients: TestClient[] = [];

async function connect(roomId = ROOM): Promise<TestClient> {
  const client = new TestClient(server.port, roomId);
  await client.ready();
  clients.push(client);
  return client;
}

beforeEach(async () => {
  server = await startRoomsWebSocketServer();
  clients = [];
});

afterEach(async () => {
  for (const client of clients) {
    client.close();
  }
  clients = [];
  await server.close();
});

describe("RoomsWebSocketServer", () => {
  it("validates the browser origin before accepting a connection", async () => {
    await server.close();
    server = await startRoomsWebSocketServer(undefined, ["https://study.example"]);
    for (const origin of [undefined, "https://untrusted.example"]) {
      const rejected = new TestClient(server.port, ROOM, origin);
      clients.push(rejected);
      await expect(rejected.ready()).rejects.toThrow();
    }
    const allowed = new TestClient(server.port, ROOM, "https://study.example");
    clients.push(allowed);
    await allowed.ready();
    allowed.watchQuestion(Q);
    expect(await allowed.waitForType("snapshot")).toMatchObject({ questionId: Q });
  });

  it("rejects client-authored checking status", async () => {
    const client = await connect();
    client.watchQuestion(Q);
    await client.waitForType("checking");
    client.sendChecking(Q, true);
    expect(await client.waitForType("error")).toMatchObject({ message: "Invalid room message." });
    client.watchQuestion(Q);
    expect(await client.waitForType("checking")).toMatchObject({ checking: false });
  });

  it("clears drafts and checking when deleting a room, including messages already in transit", async () => {
    const client = await connect();
    client.watchQuestion(Q);
    await client.waitForType("snapshot");
    server.webSocketServer.setChecking(ROOM, Q, true);
    client.sendUpdate(Q, buildInsertUpdate("late update").update);
    server.webSocketServer.removeRoom(ROOM);
    expect(await client.waitForType("error")).toMatchObject({ message: "This room has been deleted." });
    // The fixture allows reusing an ID; no old collaboration state may survive.
    const next = await connect();
    next.watchQuestion(Q);
    expect(decodeAnswerText((await next.waitForType("snapshot")).update as string)).toBe("");
    expect(await next.waitForType("checking")).toMatchObject({ checking: false });
  });

  it("sends room state on connection and broadcasts later room changes to every question", async () => {
    await server.close();
    server = await startRoomsWebSocketServer((roomId) => ({ ...roomDetails, roomId }));

    const a = await connect();
    const b = await connect();
    const otherRoom = await connect("room2");
    a.watchQuestion(Q);
    b.watchQuestion("practice-2");
    otherRoom.watchQuestion(Q);

    expect(await a.waitForType("room_snapshot")).toMatchObject({ room: roomDetails });
    expect(await b.waitForType("room_snapshot")).toMatchObject({ room: roomDetails });
    await otherRoom.waitForType("room_snapshot");

    const updatedRoom = {
      ...roomDetails,
      practice: [{ task: "task", question: "question", answer: "answer", revision: 1 }],
    };
    server.webSocketServer.broadcastRoomSnapshot(updatedRoom);

    expect(await a.waitForType("room_snapshot")).toMatchObject({ room: updatedRoom });
    expect(await b.waitForType("room_snapshot")).toMatchObject({ room: updatedRoom });
    await otherRoom.expectNoMessage((message) => message.type === "room_snapshot");
  });

  it("responds to a question watch with a snapshot then checking:false", async () => {
    const client = await connect();
    client.watchQuestion(Q);

    const snapshot = await client.waitForType("snapshot");
    expect(snapshot).toMatchObject({ type: "snapshot", questionId: Q });
    expect(typeof snapshot.update).toBe("string");
    expect(snapshot).not.toHaveProperty("roomId");

    const checking = await client.waitForType("checking");
    expect(checking).toMatchObject({ checking: false });
  });

  it("reports a room lookup failure during connection setup", async () => {
    await server.close();
    server = await startRoomsWebSocketServer(() => {
      throw new Error("Room not found.");
    });

    const client = await connect("missing");
    expect(await client.waitForType("error")).toEqual({
      type: "error",
      message: "Room not found.",
    });
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
    a.watchQuestion(Q);
    b.watchQuestion(Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    const { update } = buildInsertUpdate("hello from A");
    a.sendUpdate(Q, update);

    const received = await b.waitForType("update");
    expect(received).toEqual({ type: "update", questionId: Q, update });
    await a.expectNoMessage((message) => message.type === "update");
  });

  it("does not deliver updates across different questions", async () => {
    const a = await connect();
    const b = await connect();
    a.watchQuestion(Q);
    b.watchQuestion("practice-2");
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    a.sendUpdate(Q, buildInsertUpdate("only for Q").update);

    await b.expectNoMessage((message) => message.type === "update");
  });

  it("does not deliver updates across different rooms", async () => {
    const a = await connect();
    const b = await connect("room2");
    a.watchQuestion(Q);
    b.watchQuestion(Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    a.sendUpdate(Q, buildInsertUpdate("only for room1").update);

    await b.expectNoMessage((message) => message.type === "update");
  });

  it("gives a late joiner the current document state via snapshot", async () => {
    const a = await connect();
    a.watchQuestion(Q);
    await a.waitForType("snapshot");
    a.sendUpdate(Q, buildInsertUpdate("persisted text").update);

    // Allow the server to apply the update before the late join.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const b = await connect();
    b.watchQuestion(Q);
    const snapshot = await b.waitForType("snapshot");
    expect(decodeAnswerText(snapshot.update as string)).toBe("persisted text");
  });

  it("converges concurrent updates from two clients", async () => {
    const a = await connect();
    const b = await connect();
    a.watchQuestion(Q);
    b.watchQuestion(Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    const docA = new Y.Doc();
    docA.getText("answer").insert(0, "AAA");
    const docB = new Y.Doc();
    docB.getText("answer").insert(0, "BBB");

    a.sendUpdate(Q, Buffer.from(Y.encodeStateAsUpdate(docA)).toString("base64"));
    b.sendUpdate(Q, Buffer.from(Y.encodeStateAsUpdate(docB)).toString("base64"));

    const aReceived = await a.waitForType("update");
    const bReceived = await b.waitForType("update");
    Y.applyUpdate(docA, new Uint8Array(Buffer.from(aReceived.update as string, "base64")));
    Y.applyUpdate(docB, new Uint8Array(Buffer.from(bReceived.update as string, "base64")));

    const textA = docA.getText("answer").toString();
    const textB = docB.getText("answer").toString();
    expect(textA).toBe(textB);
    expect(textA).toContain("AAA");
    expect(textA).toContain("BBB");

    // The server's own doc should match after a fresh question snapshot.
    const c = await connect();
    c.watchQuestion(Q);
    const snapshot = await c.waitForType("snapshot");
    expect(decodeAnswerText(snapshot.update as string)).toBe(textA);
  });

  it("ignores an empty update (nothing is broadcast)", async () => {
    const a = await connect();
    const b = await connect();
    a.watchQuestion(Q);
    b.watchQuestion(Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    a.sendUpdate(Q, "");

    await b.expectNoMessage((message) => message.type === "update");
  });

  describe("checking state", () => {
    it("broadcasts checking:true to peers and clears with checking:false", async () => {
      const a = await connect();
      const b = await connect();
      a.watchQuestion(Q);
      b.watchQuestion(Q);
      await a.waitForType("snapshot");
      await b.waitForType("snapshot");
      await a.waitForType("checking");
      await b.waitForType("checking");

      server.webSocketServer.setChecking(ROOM, Q, true);
      const on = await b.waitForType("checking");
      expect(on).toMatchObject({ checking: true });

      server.webSocketServer.setChecking(ROOM, Q, false);
      const off = await b.waitForType("checking");
      expect(off).toMatchObject({ checking: false });
    });

    it("reports checking:true to a newly watching client", async () => {
      const a = await connect();
      a.watchQuestion(Q);
      await a.waitForType("snapshot");
      await a.waitForType("checking");
      server.webSocketServer.setChecking(ROOM, Q, true);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const b = await connect();
      b.watchQuestion(Q);
      await b.waitForType("snapshot");
      const checking = await b.waitForType("checking");
      expect(checking).toMatchObject({ checking: true });
    });
  });

  describe("cleanup", () => {
    it("retains the document while at least one subscriber remains", async () => {
      const a = await connect();
      const b = await connect();
      a.watchQuestion(Q);
      b.watchQuestion(Q);
      await a.waitForType("snapshot");
      await b.waitForType("snapshot");
      a.sendUpdate(Q, buildInsertUpdate("shared text").update);
      await b.waitForType("update");

      a.close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const c = await connect();
      c.watchQuestion(Q);
      const snapshot = await c.waitForType("snapshot");
      expect(decodeAnswerText(snapshot.update as string)).toBe("shared text");
    });

    it("preserves the document when a lone client watches the same question again", async () => {
      const a = await connect();
      a.watchQuestion(Q);
      await a.waitForType("snapshot");
      a.sendUpdate(Q, buildInsertUpdate("keep me").update);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Watching the same question on the same socket must not wipe state.
      a.watchQuestion(Q);
      const snapshot = await a.waitForType("snapshot");
      expect(decodeAnswerText(snapshot.update as string)).toBe("keep me");
    });

    it("preserves inactive question drafts while the client remains in the room", async () => {
      const client = await connect();
      client.watchQuestion(Q);
      await client.waitForType("snapshot");
      client.sendUpdate(Q, buildInsertUpdate("keep across navigation").update);
      await new Promise((resolve) => setTimeout(resolve, 50));

      client.watchQuestion("practice-2");
      await client.waitForType("snapshot");
      client.watchQuestion(Q);

      const snapshot = await client.waitForType("snapshot");
      expect(decodeAnswerText(snapshot.update as string)).toBe("keep across navigation");
    });

    it("discards the document once the last subscriber leaves", async () => {
      const a = await connect();
      a.watchQuestion(Q);
      await a.waitForType("snapshot");
      a.sendUpdate(Q, buildInsertUpdate("ephemeral").update);
      await new Promise((resolve) => setTimeout(resolve, 50));
      a.close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const b = await connect();
      b.watchQuestion(Q);
      const snapshot = await b.waitForType("snapshot");
      expect(decodeAnswerText(snapshot.update as string)).toBe("");
    });
  });

  it("stops delivering updates for a question after watching another", async () => {
    const a = await connect();
    const b = await connect();
    a.watchQuestion(Q);
    b.watchQuestion(Q);
    await a.waitForType("snapshot");
    await b.waitForType("snapshot");

    // B moves to another question.
    b.watchQuestion("practice-9");
    await b.waitForType("snapshot");

    a.sendUpdate(Q, buildInsertUpdate("after switch").update);
    await b.expectNoMessage((message) => message.type === "update");
  });
});
