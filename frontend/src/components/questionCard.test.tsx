import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_ANSWER_LENGTH } from "@study-platform/shared";
import QuestionCard from "./questionCard";
import { practiceItem, theoryItem } from "../test/fixtures";

function renderCard(
  overrides: Partial<Parameters<typeof QuestionCard>[0]> = {},
) {
  const props = {
    currentItem: theoryItem,
    response: null,
    isEditingLocally: true,
    answerInput: "",
    isChecking: false,
    isListening: false,
    isTranscribing: false,
    solutions: "A process is a running program.",
    onAnswerInputChange: vi.fn(),
    onVoiceInput: vi.fn(),
    onCheck: vi.fn(async () => undefined),
    onTryAgain: vi.fn(),
    ...overrides,
  };

  return { ...render(<QuestionCard {...props} />), props };
}

describe("QuestionCard", () => {
  it("disables Check when the answer is empty", () => {
    renderCard({ answerInput: "   " });

    const check = screen.getByRole("button", { name: "Check" });
    expect(check).toBeDisabled();
    expect(check.parentElement).toHaveProperty("title", "Enter an answer to check.");
  });

  it("enables Check for a non-empty answer and calls onCheck", () => {
    const { props } = renderCard({ answerInput: "My answer" });

    const check = screen.getByRole("button", { name: "Check" });
    expect(check).not.toBeDisabled();
    fireEvent.click(check);
    expect(props.onCheck).toHaveBeenCalledTimes(1);
  });

  it("disables Check when the answer exceeds the length limit", () => {
    renderCard({ answerInput: "x".repeat(MAX_ANSWER_LENGTH + 1) });

    const check = screen.getByRole("button", { name: "Check" });
    expect(check).toBeDisabled();
    expect(check.parentElement?.getAttribute("title")).toContain(
      `Answer must not exceed ${MAX_ANSWER_LENGTH} characters.`,
    );
  });

  it("forwards textarea edits to onAnswerInputChange", () => {
    const { props } = renderCard();

    fireEvent.change(screen.getByPlaceholderText("Type your answer in any language..."), {
      target: { value: "typed answer" },
    });

    expect(props.onAnswerInputChange).toHaveBeenCalledWith("typed answer");
  });

  it("calls onVoiceInput when the microphone button is clicked", () => {
    const { props } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Use microphone" }));
    expect(props.onVoiceInput).toHaveBeenCalledTimes(1);
  });

  it("disables the microphone while transcribing and not listening", () => {
    renderCard({ isTranscribing: true, isListening: false });

    expect(screen.getByRole("button", { name: "Use microphone" })).toBeDisabled();
  });

  it("shows checking status and hides the editor while checking", () => {
    renderCard({ answerInput: "pending", isChecking: true });

    expect(screen.getByRole("status")).toHaveTextContent("Checking answer...");
    expect(screen.queryByPlaceholderText("Type your answer in any language...")).toBeNull();
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  it("shows the result view and wires Try again", () => {
    const { props } = renderCard({
      currentItem: practiceItem,
      isEditingLocally: false,
      answerInput: "",
      response: {
        answer: "Submitted answer",
        result: { rating: 4, comment: "Nice work." },
      },
      solutions: [{ quality: "good", solution: "Use atomics." }],
    });

    expect(screen.getByText(/Rating:/).parentElement).toHaveTextContent("4/5");
    expect(screen.getByText(/Your answer:/).parentElement).toHaveTextContent("Submitted answer");
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("toggles the reference answer while editing", () => {
    renderCard({
      answerInput: "draft",
      solutions: "Reference theory answer.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Show reference answer" }));
    expect(screen.getByText("Reference theory answer.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide reference answer" }));
    expect(screen.queryByText("Reference theory answer.")).toBeNull();
  });
});
