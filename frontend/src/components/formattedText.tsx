import { useEffect, useState } from "react";

type ParagraphBlock = { kind: "paragraph"; text: string };
type CodeBlock = { kind: "code"; text: string };
type ContentBlock = ParagraphBlock | CodeBlock;

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

type FormattedTextProps = {
  text: string;
  className?: string;
};

function FormattedText({ text, className }: FormattedTextProps) {
  const blocks = parseFormattedText(text);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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
          <p key={index} className="formatted-text__paragraph">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

export default FormattedText;
