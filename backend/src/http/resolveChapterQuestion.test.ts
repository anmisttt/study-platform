import {
  formatQuestionRef,
  roomQuestionCheckApiPath,
  type Chapter,
  type PracticeItem,
  type TheoryItem,
} from "@study-platform/shared";
import { describe, expect, it } from "vitest";
import { resolveChapterQuestion } from "./resolveChapterQuestion";
import { userPromptForItem } from "../prompts/user-prompt";

const chapter: Chapter = {
  id: "test_chapter",
  number: 1,
  name: "Test",
  theory: [
    {
      question: "Theory question A",
      answer: "Theory answer A",
    },
    {
      question: "Theory question B",
      answer: "Theory answer B",
    },
  ],
  practice: [
    {
      task: "Practice task A",
      question: "Practice question A",
      answer: "Practice answer A",
    },
    {
      task: "Practice task B",
      question: "Practice question B",
      answer: "Practice answer B",
    },
  ],
};

function expectPromptForItem(
  questionId: string,
  expected: TheoryItem | PracticeItem,
  userAnswer = "student answer",
): void {
  const resolved = resolveChapterQuestion(chapter, questionId);
  expect(resolved).not.toBeNull();
  expect(resolved!.item).toEqual(expected);

  const prompt = userPromptForItem(userAnswer, resolved!.item);
  if ("task" in expected) {
    expect(prompt).toContain(expected.task);
  }
  expect(prompt).toContain(expected.question);
  expect(prompt).toContain(expected.answer);
  expect(prompt).toContain(userAnswer);
}

describe("resolveChapterQuestion", () => {
  it("maps theory-N to the theory item at index N", () => {
    expectPromptForItem("theory-0", chapter.theory[0]);
    expectPromptForItem("theory-1", chapter.theory[1]);
  });

  it("maps practice-N to the practice item at index N", () => {
    expectPromptForItem("practice-0", chapter.practice[0]);
    expectPromptForItem("practice-1", chapter.practice[1]);
  });

  it("does not cross theory and practice at the same index", () => {
    const theory = resolveChapterQuestion(chapter, "theory-0");
    const practice = resolveChapterQuestion(chapter, "practice-0");

    expect(theory?.item).toEqual(chapter.theory[0]);
    expect(practice?.item).toEqual(chapter.practice[0]);
    expect(theory?.item).not.toEqual(practice?.item);

    const theoryPrompt = userPromptForItem("x", theory!.item);
    const practicePrompt = userPromptForItem("x", practice!.item);
    expect(theoryPrompt).toContain("Theory question A");
    expect(theoryPrompt).not.toContain("Practice question A");
    expect(practicePrompt).toContain("Practice task A");
    expect(practicePrompt).toContain("Practice question A");
    expect(practicePrompt).not.toContain("Theory question A");
  });

  it("returns null for unknown or out-of-range ids", () => {
    expect(resolveChapterQuestion(chapter, "theory-99")).toBeNull();
    expect(resolveChapterQuestion(chapter, "practice-99")).toBeNull();
    expect(resolveChapterQuestion(chapter, "other-0")).toBeNull();
    expect(resolveChapterQuestion(chapter, "0")).toBeNull();
  });
});

describe("check path ↔ evaluate item identity", () => {
  it.each([
    ["theory", 0],
    ["theory", 1],
    ["practice", 0],
    ["practice", 1],
  ] as const)(
    "roomQuestionCheckApiPath(%s-%i) resolves to the same chapter item the UI would check",
    (type, index) => {
      const questionRef = formatQuestionRef(type, index);
      const path = roomQuestionCheckApiPath("ROOM1", questionRef);
      expect(path).toBe(`/rooms/ROOM1/questions/${questionRef}/check`);

      const questionId = path.match(/\/questions\/([^/]+)\/check$/)?.[1];
      expect(questionId).toBe(questionRef);

      const expected =
        type === "theory" ? chapter.theory[index] : chapter.practice[index];
      expectPromptForItem(questionId!, expected);
    },
  );
});
