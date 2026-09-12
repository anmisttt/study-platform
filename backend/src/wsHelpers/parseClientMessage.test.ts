import { describe, expect, it } from "vitest";
import { parseClientMessage, roomIdFromWebSocketUrl } from "../roomsWebSocketServer";

describe("parseClientMessage", () => {
  it("accepts a question watch and trims the id", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "watch_question", questionId: " q1 " }),
    );
    expect(message).toEqual({ type: "watch_question", questionId: "q1" });
  });

  it("accepts a valid update message", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "update", questionId: "q", update: "abc" }),
    );
    expect(message).toEqual({ type: "update", questionId: "q", update: "abc" });
  });

  it("accepts a valid checking message", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "checking", questionId: "q", checking: true }),
    );
    expect(message).toEqual({ type: "checking", questionId: "q", checking: true });
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
      parseClientMessage(JSON.stringify({ type: "snapshot", questionId: "q" })),
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

  it("rejects update with a non-string update field", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "update", questionId: "q", update: 5 })),
    ).toBeNull();
  });

  it("rejects checking with a non-boolean checking field", () => {
    expect(
      parseClientMessage(
        JSON.stringify({ type: "checking", questionId: "q", checking: "yes" }),
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
