import { describe, expect, it } from "vitest";
import { parseClientMessage, roomIdFromWebSocketUrl } from "../roomsWebSocketServer.js";

describe("parseClientMessage", () => {
  it("accepts a canonical one-based question watch and trims the id", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "watch_question", questionId: " practice-1 " }),
    );
    expect(message).toEqual({ type: "watch_question", questionId: "practice-1" });
  });

  it("accepts a valid update message", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "update", questionId: "theory-2", update: "abc" }),
    );
    expect(message).toEqual({ type: "update", questionId: "theory-2", update: "abc" });
  });

  it("rejects client-authored checking messages", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "checking", questionId: "theory-1", checking: true }),
    );
    expect(message).toBeNull();
  });

  it("rejects invalid JSON", () => {
    expect(parseClientMessage("{not json")).toBeNull();
  });

  it("rejects arrays and non-objects", () => {
    expect(parseClientMessage(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseClientMessage(JSON.stringify("a string"))).toBeNull();
    expect(parseClientMessage(JSON.stringify(42))).toBeNull();
    expect(parseClientMessage(JSON.stringify(null))).toBeNull();
  });

  it("rejects unknown message types", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "snapshot", questionId: "theory-1" })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "join_room", roomId: "ROOM1" })),
    ).toBeNull();
  });

  it("rejects messages with empty or whitespace ids", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "watch_question", questionId: "   " })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "update", questionId: "", update: "x" })),
    ).toBeNull();
  });

  it("rejects zero-based, leading-zero, and malformed question ids", () => {
    for (const questionId of ["practice-0", "theory-01", "q1"]) {
      expect(
        parseClientMessage(JSON.stringify({ type: "watch_question", questionId })),
      ).toBeNull();
    }
  });

  it("rejects update with a non-string update field", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "update", questionId: "theory-1", update: 5 })),
    ).toBeNull();
  });

  it("rejects checking with a non-boolean checking field", () => {
    expect(
      parseClientMessage(
        JSON.stringify({ type: "checking", questionId: "theory-1", checking: "yes" }),
      ),
    ).toBeNull();
  });
});

describe("roomIdFromWebSocketUrl", () => {
  it("extracts and decodes one room path segment", () => {
    expect(roomIdFromWebSocketUrl("/ws/rooms/ROOM%201?token=x", "/ws/rooms")).toBe(
      "ROOM 1",
    );
  });

  it("rejects a missing room id, another route, or extra path segments", () => {
    expect(roomIdFromWebSocketUrl("/ws/rooms", "/ws/rooms")).toBeNull();
    expect(roomIdFromWebSocketUrl("/ws/other/ROOM1", "/ws/rooms")).toBeNull();
    expect(roomIdFromWebSocketUrl("/ws/rooms/ROOM1/extra", "/ws/rooms")).toBeNull();
  });
});
