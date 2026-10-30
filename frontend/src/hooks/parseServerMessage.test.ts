import { describe, expect, it } from "vitest";
import { parseServerMessage } from "./useCollaborativeDraft";
import { roomAnswers } from "../test/fixtures";

describe("parseServerMessage", () => {
  it("accepts a room snapshot message", () => {
    const message = parseServerMessage(JSON.stringify({ type: "room_snapshot", answers: roomAnswers }));
    expect(message).toEqual({ type: "room_snapshot", answers: roomAnswers });
  });

  it("accepts a room summary and rejects malformed room messages", () => {
    const summary = { roomId: "ABC123", hasOwnerLlmKey: false, chapters: [] };
    expect(parseServerMessage(JSON.stringify({ type: "room_summary", summary }))).toEqual({ type: "room_summary", summary });
    expect(parseServerMessage(JSON.stringify({ type: "room_summary", summary: { ...summary, hasOwnerLlmKey: "no" } }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "room_snapshot", answers: { ...roomAnswers, chapterId: 1 } }))).toBeNull();
  });

  it("rejects draft messages without a chapter", () => {
    expect(parseServerMessage(JSON.stringify({ type: "update", questionId: "q", update: "abc" }))).toBeNull();
  });

  it("accepts a snapshot message", () => {
    const message = parseServerMessage(
      JSON.stringify({ type: "snapshot", chapterId: "first_chapter", questionId: "q", update: "abc" }),
    );
    expect(message).toEqual({ type: "snapshot", chapterId: "first_chapter", questionId: "q", update: "abc" });
  });

  it("accepts an update message", () => {
    const message = parseServerMessage(
      JSON.stringify({ type: "update", chapterId: "first_chapter", questionId: "q", update: "abc" }),
    );
    expect(message).toEqual({ type: "update", chapterId: "first_chapter", questionId: "q", update: "abc" });
  });

  it("accepts a checking message", () => {
    const message = parseServerMessage(
      JSON.stringify({ type: "checking", chapterId: "first_chapter", questionId: "q", checking: false }),
    );
    expect(message).toEqual({ type: "checking", chapterId: "first_chapter", questionId: "q", checking: false });
  });

  it("accepts an error message", () => {
    const message = parseServerMessage(JSON.stringify({ type: "error", message: "boom" }));
    expect(message).toEqual({ type: "error", message: "boom" });
  });

  it("rejects invalid JSON", () => {
    expect(parseServerMessage("nope{")).toBeNull();
  });

  it("rejects arrays and non-objects", () => {
    expect(parseServerMessage(JSON.stringify([1]))).toBeNull();
    expect(parseServerMessage(JSON.stringify("x"))).toBeNull();
    expect(parseServerMessage(JSON.stringify(null))).toBeNull();
  });

  it("rejects snapshot/update with missing or wrong-typed fields", () => {
    expect(parseServerMessage(JSON.stringify({ type: "update", chapterId: "first_chapter", questionId: "q" }))).toBeNull();
    expect(
      parseServerMessage(JSON.stringify({ type: "update", chapterId: "first_chapter", questionId: 1, update: "x" })),
    ).toBeNull();
  });

  it("rejects checking without a boolean and error without a message", () => {
    expect(
      parseServerMessage(JSON.stringify({ type: "checking", chapterId: "first_chapter", questionId: "q", checking: 1 })),
    ).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "error" }))).toBeNull();
  });
});
