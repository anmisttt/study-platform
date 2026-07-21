import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FormattedText from "./formattedText";

describe("FormattedText", () => {
  it("styles lines that start with a number and a dot as design list items", () => {
    render(
      <FormattedText
        text={[
          "Tasks:",
          "1. Run the setup.",
          "2. Implement the fix.",
          "3. Write a short summary.",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Tasks:")).toBeTruthy();
    expect(screen.getByText("Run the setup.")).toBeTruthy();
    expect(screen.getByText("Implement the fix.")).toBeTruthy();
    expect(screen.getByText("Write a short summary.")).toBeTruthy();

    const badges = document.querySelectorAll(".formatted-text__numbered-badge");
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent("1");
    expect(badges[1]).toHaveTextContent("2");
    expect(badges[2]).toHaveTextContent("3");
    expect(document.querySelectorAll(".formatted-text__numbered-item")).toHaveLength(3);
  });

  it("does not treat mid-sentence numbers as list markers", () => {
    render(<FormattedText text="Use version 1.2 of the protocol." />);

    expect(screen.getByText("Use version 1.2 of the protocol.")).toBeTruthy();
    expect(document.querySelector(".formatted-text__numbered-list")).toBeNull();
  });

  it("styles inline backtick spans like design mono chips", () => {
    render(
      <FormattedText text={"Setup — save as `ch10_quorum_race.py` and run it."} className="details" />,
    );

    const code = screen.getByText("ch10_quorum_race.py");
    expect(code.tagName).toBe("CODE");
    expect(code).toHaveClass("formatted-text__inline-code");
    expect(screen.getByText(/Setup — save as/)).toBeTruthy();
  });

  it("marks only the first paragraph with emphasis when requested", () => {
    render(
      <FormattedText
        emphasizeFirstParagraph
        className="details"
        text={["Lead sentence about the task.", "Follow-up setup notes."].join("\n\n")}
      />,
    );

    const paragraphs = document.querySelectorAll(".formatted-text__paragraph");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveClass("formatted-text__paragraph--emphasis");
    expect(paragraphs[1]).not.toHaveClass("formatted-text__paragraph--emphasis");
  });
});
