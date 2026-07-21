import { useEffect, useState, type ReactNode } from "react";

type ParagraphBlock = { kind: "paragraph"; text: string };
type CodeBlock = { kind: "code"; text: string };
type ContentBlock = ParagraphBlock | CodeBlock;

const NUMBERED_LINE_PATTERN = /^(\d+)\.\s+(.*)$/;
function renderInlineText(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const inlineCodePattern = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = inlineCodePattern.exec(text);
  let key = 0;

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <code key={`inline-code-${key}`} className="formatted-text__inline-code">
        {match[1]}
      </code>,
    );
    key += 1;
    lastIndex = match.index + match[0].length;
    match = inlineCodePattern.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}

function parseFormattedText(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const fencePattern = /```(?:[\w-]*)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = fencePattern.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      const paragraph = text.slice(lastIndex, match.index).trim();
      if (paragraph) {
        blocks.push({ kind: "paragraph", text: paragraph });
      }
    }

    blocks.push({ kind: "code", text: match[1].replace(/\n$/, "") });
    lastIndex = match.index + match[0].length;
    match = fencePattern.exec(text);
  }

  if (lastIndex < text.length) {
    const paragraph = text.slice(lastIndex).trim();
    if (paragraph) {
      blocks.push({ kind: "paragraph", text: paragraph });
    }
  }

  return blocks;
}

function renderParagraphContent(
  text: string,
  blockKey: number,
  takeEmphasisClass: () => string | undefined,
): ReactNode {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let index = 0;
  let part = 0;

  while (index < lines.length) {
    const numberedMatch = NUMBERED_LINE_PATTERN.exec(lines[index] ?? "");
    if (numberedMatch) {
      const items: Array<{ number: string; text: string }> = [];
      while (index < lines.length) {
        const match = NUMBERED_LINE_PATTERN.exec(lines[index] ?? "");
        if (!match) {
          break;
        }
        items.push({ number: match[1], text: match[2] });
        index += 1;
      }

      elements.push(
        <ol key={`${blockKey}-list-${part}`} className="formatted-text__numbered-list">
          {items.map((item) => (
            <li
              key={`${item.number}-${item.text.slice(0, 24)}`}
              className="formatted-text__numbered-item"
              value={Number(item.number)}
            >
              <span className="formatted-text__numbered-badge" aria-hidden="true">
                {item.number}
              </span>
              <span className="formatted-text__numbered-body">{renderInlineText(item.text)}</span>
            </li>
          ))}
        </ol>,
      );
      part += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && !NUMBERED_LINE_PATTERN.test(lines[index] ?? "")) {
      const line = lines[index] ?? "";
      if (line.trim() === "") {
        index += 1;
        if (paragraphLines.some((entry) => entry.trim())) {
          break;
        }
        continue;
      }
      paragraphLines.push(line);
      index += 1;
    }

    const paragraphText = paragraphLines.join("\n");
    if (paragraphText.trim()) {
      const emphasisClass = takeEmphasisClass();
      elements.push(
        <p
          key={`${blockKey}-paragraph-${part}`}
          className={["formatted-text__paragraph", emphasisClass].filter(Boolean).join(" ")}
        >
          {renderInlineText(paragraphText)}
        </p>,
      );
      part += 1;
    }
  }

  return elements;
}

type FormattedTextProps = {
  text: string;
  className?: string;
  emphasizeFirstParagraph?: boolean;
};

function FormattedText({ text, className, emphasizeFirstParagraph = false }: FormattedTextProps) {
  const blocks = parseFormattedText(text);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  let pendingFirstParagraphEmphasis = emphasizeFirstParagraph;

  function takeEmphasisClass(): string | undefined {
    if (!pendingFirstParagraphEmphasis) {
      return undefined;
    }
    pendingFirstParagraphEmphasis = false;
    return "formatted-text__paragraph--emphasis";
  }

  useEffect(() => {
    if (copiedIndex === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedIndex(null);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copiedIndex]);

  const copyToClipboard = async (value: string, index: number) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedIndex(index);
    } catch {
      setCopiedIndex(null);
    }
  };

  return (
    <div className={["formatted-text", className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <div key={index} className="formatted-text__code-block">
            <button
              type="button"
              className={[
                "formatted-text__code-copy-button",
                copiedIndex === index ? "copied" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => void copyToClipboard(block.text, index)}
              aria-label={copiedIndex === index ? "Code copied" : "Copy code block"}
              title={copiedIndex === index ? "Copied" : "Copy"}
            >
              {copiedIndex === index ? (
                <svg
                  className="formatted-text__code-copy-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M5 13L10 18L19 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  className="formatted-text__code-copy-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect
                    x="9"
                    y="9"
                    width="10"
                    height="10"
                    rx="2"
                    ry="2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <pre className="formatted-text__code">
              <code>{block.text}</code>
            </pre>
          </div>
        ) : (
          <div key={index} className="formatted-text__section">
            {renderParagraphContent(block.text, index, takeEmphasisClass)}
          </div>
        ),
      )}
    </div>
  );
}

export default FormattedText;
