import type * as Y from "yjs";

export function updateYText(ytext: Y.Text, nextValue: string): void {
  const current = ytext.toString();
  if (nextValue === current) {
    return;
  }

  let start = 0;
  while (start < current.length && start < nextValue.length && current[start] === nextValue[start]) {
    start += 1;
  }

  let currentEnd = current.length;
  let valueEnd = nextValue.length;
  while (
    currentEnd > start &&
    valueEnd > start &&
    current[currentEnd - 1] === nextValue[valueEnd - 1]
  ) {
    currentEnd -= 1;
    valueEnd -= 1;
  }

  const deleteLength = currentEnd - start;
  if (deleteLength > 0) {
    ytext.delete(start, deleteLength);
  }

  const insertText = nextValue.slice(start, valueEnd);
  if (insertText.length > 0) {
    ytext.insert(start, insertText);
  }
}
