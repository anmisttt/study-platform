import type { PracticeItem, TheoryItem } from "@study-platform/shared";
import { describe, expect, it } from "vitest";
import { systemPrompt } from "./system-prompt";
import { userPromptForItem } from "./user-prompt";

describe("tutor prompts", () => {
  it("makes correctness—not reference-answer similarity—the grading criterion", () => {
    expect(systemPrompt).toContain("reference answer is only one example");
    expect(systemPrompt).toContain(
      "It is not the grading rubric or a canonical answer",
    );
    expect(systemPrompt).toContain(
      "Do not reward or penalize wording, structure, verbosity, style, or similarity to the reference answer",
    );
    expect(systemPrompt).toContain("Accept any valid alternative approach");
    expect(systemPrompt).toContain(
      "The difference itself is never evidence of an error",
    );
  });

  it("labels a stored practice answer as an example and emits valid JSON", () => {
    const item: PracticeItem = {
      task: "Implement the task",
      question: "Use the value \"quoted\" and explain why.",
      answer: "One example\nwith multiple lines",
    };

    const payload = JSON.parse(userPromptForItem("A different valid solution", item));

    expect(payload).toEqual({
      item_type: "practice",
      question: 'Implement the task\n\nUse the value "quoted" and explain why.',
      user_answer: "A different valid solution",
      reference_answer_example: "One example\nwith multiple lines",
    });
    expect(payload).not.toHaveProperty("correct_answer");
  });

  it("identifies theory items without changing their question", () => {
    const item: TheoryItem = {
      question: "Explain the concept",
      answer: "An example explanation",
    };

    expect(JSON.parse(userPromptForItem("A correct explanation", item))).toEqual({
      item_type: "theory",
      question: "Explain the concept",
      user_answer: "A correct explanation",
      reference_answer_example: "An example explanation",
    });
  });
});
