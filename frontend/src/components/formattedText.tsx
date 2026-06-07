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

  return (
    <div className={["formatted-text", className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <pre key={index} className="formatted-text__code">
            <code>{block.text}</code>
          </pre>
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
