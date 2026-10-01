import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FormattedText from "./formattedText";

describe("FormattedText", () => {
  it("renders Markdown references as links and preserves surrounding punctuation", () => {
    const references = [
      ["Python SDK 1.20.0", "https://github.com/temporalio/sdk-python/tree/1.20.0"],
      ["durable timers", "https://docs.temporal.io/develop/python/workflows/timers"],
      ["signals", "https://docs.temporal.io/develop/python/workflows/message-passing"],
    ];
    const [sdk, timers, signals] = references.map(([label, url]) => `[${label}](${url})`);
    const { container } = render(<FormattedText text={`${sdk}, ${timers}, and ${signals}`} />);

    for (const [label, url] of references) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(container).toHaveTextContent("Python SDK 1.20.0, durable timers, and signals");
  });

  it("renders links in numbered steps and expanded content", () => {
    render(<FormattedText text={[
      "1. Read [the guide](https://example.com/guide).",
      ":::cut References",
      "Read [the reference](https://example.com/reference).",
      ":::",
    ].join("\n")} />);

    expect(screen.getByRole("link", { name: "the guide" }).closest("li")).toBeTruthy();
    fireEvent.click(screen.getByText("References"));
    expect(screen.getByRole("link", { name: "the reference" })).toHaveAttribute(
      "href", "https://example.com/reference",
    );
  });

  it("leaves code examples and non-HTTP link destinations as text", () => {
    const reference = "[example](https://example.com)";
    render(<FormattedText text={[
      `Inline: \`${reference}\``,
      "```text", reference, "```",
      "[unsafe](javascript:alert) and [unfinished](https://example.com",
    ].join("\n")} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector(".formatted-text__inline-code")).toHaveTextContent(reference);
    expect(document.querySelector("pre code")).toHaveTextContent(reference);
  });

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

  it("omits the line-number gutter for code with three lines or fewer", () => {
    render(
      <FormattedText
        text={["```sql", "SELECT 1;", "SELECT 2;", "SELECT 3;", "```"].join("\n")}
      />,
    );

    expect(document.querySelector(".formatted-text__code-gutter")).toBeNull();
    expect(document.querySelector(".formatted-text__code")).not.toHaveClass(
      "formatted-text__code--numbered",
    );
  });

  it("renders a non-copyable line-number gutter for code with more than three lines", () => {
    render(
      <FormattedText
        text={["```sql", "SELECT 1;", "SELECT 2;", "SELECT 3;", "SELECT 4;", "```"].join("\n")}
      />,
    );

    const gutter = document.querySelector(".formatted-text__code-gutter");
    expect(gutter).toHaveAttribute("aria-hidden", "true");
    expect(gutter?.children).toHaveLength(4);
    expect(gutter?.textContent).toBe("");
    expect(document.querySelector(".formatted-text__code")).toHaveClass(
      "formatted-text__code--numbered",
    );

    const code = document.querySelector(".formatted-text__code code");
    expect(code?.textContent).toBe("SELECT 1;\nSELECT 2;\nSELECT 3;\nSELECT 4;");
  });

  it("copies the original source without line numbers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <FormattedText
        text={["```sql", "SELECT 1;", "SELECT 2;", "SELECT 3;", "SELECT 4;", "```"].join("\n")}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy code block" }));
    });

    expect(writeText).toHaveBeenCalledWith("SELECT 1;\nSELECT 2;\nSELECT 3;\nSELECT 4;");
    expect(screen.getByRole("button", { name: "Code copied" })).toBeTruthy();
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
