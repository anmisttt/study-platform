import type { TextPromptClient } from "@langfuse/client";
import type { TutorEvaluationRequest } from "../prompts/user-prompt";
import { describe, expect, it } from "vitest";
import { tutorLangfuseConfig } from "./tutor";

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
  it("uses one generation and only adds the missing reference answer to metadata", () => {
    expect(
      tutorLangfuseConfig(request, systemPrompt(), {
        sessionId: "room-1",
        metadata: { chapter_id: "chapter-1" },
      }),
    ).toEqual({
      traceName: "evaluate-tutor-answer",
      sessionId: "room-1",
      tags: ["tutor", "answer-evaluation", "theory"],
      generationName: "grade-answer",
      langfusePrompt: systemPrompt(),
      generationMetadata: {
        chapter_id: "chapter-1",
        reference_answer: request.referenceAnswer,
      },
    });
  });
});
