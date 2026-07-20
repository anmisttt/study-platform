import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./draftRelay";

describe("parseClientMessage", () => {
  it("accepts a valid subscribe message and trims ids", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "subscribe", roomId: " ROOM ", questionId: " q1 " }),
    );
    expect(message).toEqual({ type: "subscribe", roomId: "ROOM", questionId: "q1" });
  });

  it("accepts a valid update message", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "update", roomId: "r", questionId: "q", update: "abc" }),
    );
    expect(message).toEqual({ type: "update", roomId: "r", questionId: "q", update: "abc" });
  });

  it("accepts a valid checking message", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "checking", roomId: "r", questionId: "q", checking: true }),
    );
    expect(message).toEqual({ type: "checking", roomId: "r", questionId: "q", checking: true });
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
      parseClientMessage(JSON.stringify({ type: "snapshot", roomId: "r", questionId: "q" })),
    ).toBeNull();
  });

  it("rejects subscribe/update/checking with empty or whitespace ids", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "subscribe", roomId: "", questionId: "q" })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "subscribe", roomId: "   ", questionId: "q" })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "update", roomId: "r", questionId: "", update: "x" })),
    ).toBeNull();
  });

  it("rejects update with a non-string update field", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "update", roomId: "r", questionId: "q", update: 5 })),
    ).toBeNull();
  });

  it("rejects checking with a non-boolean checking field", () => {
    expect(
      parseClientMessage(
        JSON.stringify({ type: "checking", roomId: "r", questionId: "q", checking: "yes" }),
      ),
    ).toBeNull();
  });
});
