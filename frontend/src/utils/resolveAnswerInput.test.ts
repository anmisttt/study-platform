import { describe, expect, it } from "vitest";
import { resolveAnswerInput } from "./draftStorage";

describe("resolveAnswerInput", () => {
  it("returns the draft when one exists for the question", () => {
    const session = {
      drafts: { q1: "draft text" },
      responses: { q1: { answer: "checked answer" } },
    };
    expect(resolveAnswerInput("room", "q1", session)).toBe("draft text");
  });

  it("prefers an empty-string draft over the response answer", () => {
    const session = {
      drafts: { q1: "" },
      responses: { q1: { answer: "checked answer" } },
    };
    expect(resolveAnswerInput("room", "q1", session)).toBe("");
  });

  it("falls back to the response answer when there is no draft", () => {
    const session = {
      drafts: {} as Record<string, string>,
      responses: { q1: { answer: "checked answer" } },
    };
    expect(resolveAnswerInput("room", "q1", session)).toBe("checked answer");
  });

  it("returns an empty string when neither draft nor response exists", () => {
    const session = {
      drafts: {} as Record<string, string>,
      responses: {} as Record<string, { answer: string }>,
    };
    expect(resolveAnswerInput("room", "q1", session)).toBe("");
  });
});
