import { fireEvent, render, screen } from "@testing-library/react";
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

  it("syntax-highlights fenced code when a language tag is present", () => {
    render(
      <FormattedText
        text={["Before", "```sql", "SELECT 1;", "```", "After"].join("\n")}
      />,
    );

    const code = document.querySelector(".formatted-text__code code");
    expect(code).toHaveClass("hljs");
    expect(code).toHaveClass("language-sql");
    expect(code?.querySelector(".hljs-keyword")).toBeTruthy();
    expect(code?.textContent).toBe("SELECT 1;");
  });

  it("syntax-highlights TypeScript fenced code, including ts aliases", () => {
    render(
      <FormattedText
        text={["```ts", "const n: number = 1;", "```"].join("\n")}
      />,
    );

    const code = document.querySelector(".formatted-text__code code");
    expect(code).toHaveClass("hljs");
    expect(code).toHaveClass("language-typescript");
    expect(code?.querySelector(".hljs-keyword")).toBeTruthy();
    expect(code?.textContent).toBe("const n: number = 1;");
  });

  it("escapes unlabeled fenced code without token spans", () => {
    render(
      <FormattedText text={["```", "SELECT <id>", "```"].join("\n")} />,
    );

    const code = document.querySelector(".formatted-text__code code");
    expect(code).toHaveClass("hljs");
    expect(code).not.toHaveClass("language-sql");
    expect(code?.querySelector(".hljs-keyword")).toBeNull();
    expect(code?.innerHTML).toBe("SELECT &lt;id&gt;");
  });

  it("aligns indented task blocks with the numbered body", () => {
    render(
      <FormattedText
        text={[
          "Tasks:",
          "1. Implement the change:",
          "",
          "   ```bash",
          "   docker compose exec app python projector.py",
          "   ```",
          "",
          "   Verify the projection output.",
          "2. Explain the result.",
        ].join("\n")}
      />,
    );

    const codeBlock = document.querySelector(".formatted-text__code-block");
    expect(codeBlock).toHaveClass("formatted-text__code-block--numbered-body");
    expect(codeBlock?.textContent).toContain("docker compose exec app python projector.py");
    expect(codeBlock?.textContent).not.toContain("   docker compose exec");

    expect(screen.getByText("Verify the projection output.")).toHaveClass(
      "formatted-text__paragraph--numbered-body",
    );
  });

  it("renders cut content closed and toggles it from the title", () => {
    render(
      <FormattedText
        text={[
          "Before",
          ":::cut Observe the current state",
          "The primary is `node-1`.",
          "",
          "```sql",
          "SELECT status FROM replicas;",
          "```",
          ":::",
          "After",
        ].join("\n")}
      />,
    );

    const title = screen.getByText("Observe the current state");
    const cut = title.closest("details");
    expect(cut).not.toHaveAttribute("open");
    expect(screen.getByText("node-1")).toHaveClass("formatted-text__inline-code");

    const code = document.querySelector(".formatted-text__cut .formatted-text__code code");
    expect(code).toHaveClass("language-sql");
    expect(code?.textContent).toBe("SELECT status FROM replicas;");

    fireEvent.click(title.closest("summary")!);
    expect(cut).toHaveAttribute("open");

    fireEvent.click(title.closest("summary")!);
    expect(cut).not.toHaveAttribute("open");
  });

  it("aligns an indented cut with a numbered task body", () => {
    render(
      <FormattedText
        text={[
          "1. Inspect the cluster:",
          "",
          "   :::cut Show inspection commands",
          "   ```bash",
          "   docker compose ps",
          "   ```",
          "   :::",
          "2. Explain the result.",
        ].join("\n")}
      />,
    );

    const cut = screen.getByText("Show inspection commands").closest("details");
    expect(cut).toHaveClass("formatted-text__cut--numbered-body");
    expect(cut?.textContent).toContain("docker compose ps");
    expect(cut?.textContent).not.toContain("   docker compose ps");
  });
});
