import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { updateYText } from "./yTextBinding";

function makeYText(initial: string): Y.Text {
  const doc = new Y.Doc();
  const ytext = doc.getText("answer");
  if (initial.length > 0) {
    ytext.insert(0, initial);
  }
  return ytext;
}

function applyValue(initial: string, next: string): string {
  const ytext = makeYText(initial);
  updateYText(ytext, next);
  return ytext.toString();
}

describe("updateYText", () => {
  it("inserts at the start", () => {
    expect(applyValue("world", "hello world")).toBe("hello world");
  });

  it("inserts in the middle", () => {
    expect(applyValue("helloworld", "hello world")).toBe("hello world");
  });

  it("inserts at the end", () => {
    expect(applyValue("hello", "hello world")).toBe("hello world");
  });

  it("deletes at the start", () => {
    expect(applyValue("hello world", "world")).toBe("world");
  });

  it("deletes in the middle", () => {
    expect(applyValue("hello world", "helloworld")).toBe("helloworld");
  });

  it("deletes at the end", () => {
    expect(applyValue("hello world", "hello")).toBe("hello");
  });

  it("replaces a selection", () => {
    expect(applyValue("hello world", "hello there")).toBe("hello there");
  });

  it("is a no-op when the value is unchanged", () => {
    const ytext = makeYText("hello");
    let changed = false;
    ytext.observe(() => {
      changed = true;
    });
    updateYText(ytext, "hello");
    expect(ytext.toString()).toBe("hello");
    expect(changed).toBe(false);
  });

  it("clears the whole value", () => {
    expect(applyValue("abc", "")).toBe("");
  });

  it("fills from empty", () => {
    expect(applyValue("", "abc")).toBe("abc");
  });

  it("handles repeated-substring edge cases", () => {
    expect(applyValue("aaa", "aa")).toBe("aa");
    expect(applyValue("abab", "abb")).toBe("abb");
    expect(applyValue("aa", "a")).toBe("a");
    expect(applyValue("aa", "aaa")).toBe("aaa");
  });

  it("handles multi-line text with newlines", () => {
    expect(applyValue("line1\nline3", "line1\nline2\nline3")).toBe("line1\nline2\nline3");
  });

  it("handles unicode / emoji edits without corrupting surrogate pairs", () => {
    expect(applyValue("hi ", "hi \u{1F600}")).toBe("hi \u{1F600}");
    // Deleting an emoji at the end must not leave a lone surrogate.
    const result = applyValue("hi \u{1F600}", "hi ");
    expect(result).toBe("hi ");
    // Editing text before an emoji must keep the emoji intact.
    expect(applyValue("a\u{1F600}b", "aa\u{1F600}b")).toBe("aa\u{1F600}b");
  });

  it("only issues a minimal single-range edit (no full rewrite)", () => {
    const ytext = makeYText("hello world");
    const deltas: Array<{ insert?: unknown; delete?: number; retain?: number }> = [];
    ytext.observe((event) => {
      deltas.push(...(event.changes.delta as typeof deltas));
    });
    updateYText(ytext, "hello brave world");
    // A minimal insert keeps the shared "hello " prefix and " world" suffix,
    // so the first delta is a retain rather than a delete of everything.
    expect(deltas[0]).toEqual({ retain: 6 });
  });

  it("converges when two replicas make concurrent inserts at the same index", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("answer");
    const textB = docB.getText("answer");
    textA.insert(0, "base");

    // Sync B up to A's state.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Concurrent local edits captured as diffs against the same starting value.
    updateYText(textA, "baseAAA");
    updateYText(textB, "baseBBB");

    // Exchange updates.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain("AAA");
    expect(textA.toString()).toContain("BBB");
  });
});
