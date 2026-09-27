import type { TextPromptClient } from "@langfuse/client";
import type { TutorEvaluationRequest } from "../prompts/user-prompt.js";
import { describe, expect, it } from "vitest";
import { tutorLangfuseConfig, tutorLangfuseTraceAttributes } from "./tutor.js";

const request: TutorEvaluationRequest = {
  itemType: "theory",
  question: "What is replication?",
  userResponse: "Keeping copies of the same data.",
  referenceAnswer: "Replication stores copies of data on multiple nodes.",
  llmPrompt: "prompt sent to the model",
};

function systemPrompt(): TextPromptClient {
  return {
    name: "theory-system-prompt",
    version: 7,
    isFallback: false,
  } as TextPromptClient;
}

describe("tutor Langfuse config", () => {
  it("uses one generation and adds the reference answer to generation metadata", () => {
    expect(
      tutorLangfuseConfig(request, systemPrompt()),
    ).toEqual({
      generationName: "grade-answer",
      langfusePrompt: systemPrompt(),
      generationMetadata: {
        reference_answer: request.referenceAnswer,
      },
    });
  });

  it("adds chapter and question identifiers to trace-level metadata", () => {
    expect(
      tutorLangfuseTraceAttributes(request, {
        sessionId: "room-1",
        metadata: { chapterNumber: "1", questionRef: "practice-1" },
      }),
    ).toEqual({
      traceName: "evaluate-tutor-answer",
      sessionId: "room-1",
      tags: ["tutor", "answer-evaluation", "theory"],
      metadata: { chapterNumber: "1", questionRef: "practice-1" },
    });
  });
});

it("attributes room costs to the owner and records the initiator separately", () => {
  const attributes = tutorLangfuseTraceAttributes(request, {
    userId: "owner", sessionId: "room", metadata: { actorId: "guest-account" },
  });
  expect(attributes.userId).toBe("owner");
  expect(attributes.sessionId).toBe("room");
  expect(attributes.metadata).toMatchObject({ actorId: "guest-account" });
});
