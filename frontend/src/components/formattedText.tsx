import { useEffect, useState, type ReactNode } from "react";
import { highlightCode } from "../lib/highlightCode";

type ParagraphBlock = { kind: "paragraph"; text: string };
type CodeBlock = {
  kind: "code";
  text: string;
  language?: string;
  alignWithNumberedBody?: boolean;
};
type CutBlock = {
  kind: "cut";
  title: string;
  text: string;
  alignWithNumberedBody?: boolean;
};
type ContentBlock = ParagraphBlock | CodeBlock | CutBlock;

const NUMBERED_LINE_PATTERN = /^(\d+)\.\s+(.*)$/;
const NUMBERED_BODY_INDENT_PATTERN = /^(?: {3,}|\t)/;
const FENCED_BLOCK_PATTERN =
  /```([\w-]*)?\n?([\s\S]*?)```|^([ \t]*):::cut[ \t]+([^\r\n]+?)[ \t]*\r?\n([\s\S]*?)^\3:::[ \t]*(?:\r?\n|$)/gm;

function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
}

function getNumberedBodyIndent(text: string): string | undefined {
  const indent = /^[ \t]+/.exec(text)?.[0];
  return indent && NUMBERED_BODY_INDENT_PATTERN.test(indent) ? indent : undefined;
}

function removeIndent(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join("\n");
}

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
  let lastIndex = 0;
  let match: RegExpExecArray | null = FENCED_BLOCK_PATTERN.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      const paragraph = trimBlankLines(text.slice(lastIndex, match.index));
      if (paragraph) {
        blocks.push({ kind: "paragraph", text: paragraph });
      }
    }

    if (match[4] !== undefined) {
      const indent = getNumberedBodyIndent(match[3] ?? "");
      const content = match[5].replace(/\n[ \t]*$/, "");
      blocks.push({
        kind: "cut",
        title: match[4].trim(),
        text: indent ? removeIndent(content, indent) : content,
        ...(indent ? { alignWithNumberedBody: true } : {}),
      });
    } else {
      const language = match[1]?.trim().toLowerCase() || undefined;
      const lineStart = text.lastIndexOf("\n", match.index - 1) + 1;
      const indent = getNumberedBodyIndent(text.slice(lineStart, match.index));
      const code = match[2].replace(/\n[ \t]*$/, "");
      blocks.push({
        kind: "code",
        text: indent ? removeIndent(code, indent) : code,
        ...(language ? { language } : {}),
        ...(indent ? { alignWithNumberedBody: true } : {}),
      });
    }
    lastIndex = match.index + match[0].length;
    match = FENCED_BLOCK_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    const paragraph = trimBlankLines(text.slice(lastIndex));
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
      const indent = getNumberedBodyIndent(paragraphText);
      const displayText = indent ? removeIndent(paragraphText, indent) : paragraphText;
      elements.push(
        <p
          key={`${blockKey}-paragraph-${part}`}
          className={[
            "formatted-text__paragraph",
            indent ? "formatted-text__paragraph--numbered-body" : "",
            emphasisClass,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {renderInlineText(displayText)}
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
      {blocks.map((block, index) => {
        if (block.kind === "cut") {
          return (
            <details
              key={index}
              className={[
                "formatted-text__cut",
                block.alignWithNumberedBody ? "formatted-text__cut--numbered-body" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <summary className="formatted-text__cut-title">
                <svg
                  className="formatted-text__cut-chevron"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    d="M7 5L12 10L7 15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{renderInlineText(block.title)}</span>
              </summary>
              <div className="formatted-text__cut-body">
                <FormattedText text={block.text} />
              </div>
            </details>
          );
        }

        if (block.kind === "code") {
          const highlighted = highlightCode(block.text, block.language);
          return (
            <div
              key={index}
              className={[
                "formatted-text__code-block",
                block.alignWithNumberedBody
                  ? "formatted-text__code-block--numbered-body"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
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
                <code
                  className={
                    highlighted.language
                      ? `language-${highlighted.language} hljs`
                      : "hljs"
                  }
                  dangerouslySetInnerHTML={{ __html: highlighted.html }}
                />
              </pre>
            </div>
          );
        }

        return (
          <div key={index} className="formatted-text__section">
            {renderParagraphContent(block.text, index, takeEmphasisClass)}
          </div>
        );
      })}
    </div>
  );
}

export default FormattedText;
