import type { PracticeItem, TheoryItem } from "@study-platform/shared";
import { describe, expect, it } from "vitest";
import { practiceSystemPrompt, theorySystemPrompt } from "./system-prompt";
import { userPromptForItem } from "./user-prompt";

describe("tutor prompts", () => {
  it("grades practice from the question without a reference answer", () => {
    expect(practiceSystemPrompt).toContain(
      "Treat the question as the only source of grading requirements",
    );
    expect(practiceSystemPrompt).not.toContain("reference");
  });

  it("keeps reference-answer similarity out of theory grading criteria", () => {
    expect(theorySystemPrompt).toContain("reference answer");
    expect(theorySystemPrompt).toContain("only one example");
    expect(theorySystemPrompt).toContain(
      "It is not the grading rubric or a canonical answer",
    );
    expect(theorySystemPrompt).toContain(
      "Do not reward or penalize wording, structure, verbosity, style, or similarity to the reference answer",
    );
    expect(theorySystemPrompt).toContain("Accept any valid alternative approach");
    expect(theorySystemPrompt).toContain(
      "The difference itself is never evidence of an error",
    );
  });

  it("omits the stored answer from a practice payload", () => {
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
    });
    expect(payload).not.toHaveProperty("reference_answer_example");
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
