import { describe, expect, it } from "vitest";
import { parseServerMessage } from "./useCollaborativeDraft";

describe("parseServerMessage", () => {
  it("accepts a snapshot message", () => {
    const message = parseServerMessage(
      JSON.stringify({ type: "snapshot", roomId: "r", questionId: "q", update: "abc" }),
    );
    expect(message).toEqual({ type: "snapshot", roomId: "r", questionId: "q", update: "abc" });
  });

  it("accepts an update message", () => {
    const message = parseServerMessage(
      JSON.stringify({ type: "update", roomId: "r", questionId: "q", update: "abc" }),
    );
    expect(message).toEqual({ type: "update", roomId: "r", questionId: "q", update: "abc" });
  });

  it("accepts a checking message", () => {
    const message = parseServerMessage(
      JSON.stringify({ type: "checking", roomId: "r", questionId: "q", checking: false }),
    );
    expect(message).toEqual({ type: "checking", roomId: "r", questionId: "q", checking: false });
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
    expect(parseServerMessage(JSON.stringify({ type: "update", roomId: "r", questionId: "q" }))).toBeNull();
    expect(
      parseServerMessage(JSON.stringify({ type: "update", roomId: 1, questionId: "q", update: "x" })),
    ).toBeNull();
  });

  it("rejects checking without a boolean and error without a message", () => {
    expect(
      parseServerMessage(JSON.stringify({ type: "checking", roomId: "r", questionId: "q", checking: 1 })),
    ).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "error" }))).toBeNull();
  });
});
