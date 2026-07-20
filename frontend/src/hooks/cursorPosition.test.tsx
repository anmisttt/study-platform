import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  connectAndSnapshot,
  deliverSnapshot,
  deliverUpdate,
  encodeUpdate,
  renderDraft,
  type Harness,
} from "../test/draftHarness";

/**
 * A peer replica that shares document history with the client under test. Its
 * snapshot seeds the client, and `edit()` produces incremental updates so remote
 * edits land at deterministic offsets (letting us assert caret behavior).
 */
function makePeer(initial: string) {
  const doc = new Y.Doc();
  const text = doc.getText("answer");
  text.insert(0, initial);
  return {
    snapshot: encodeUpdate(Y.encodeStateAsUpdate(doc)),
    /** Apply an edit and return the resulting *incremental* update. */
    edit(mutate: (text: Y.Text) => void): string {
      const before = Y.encodeStateVector(doc);
      doc.transact(() => mutate(text));
      return encodeUpdate(Y.encodeStateAsUpdate(doc, before));
    },
    /** The peer's current *full* state (for snapshot messages). */
    full(): string {
      return encodeUpdate(Y.encodeStateAsUpdate(doc));
    },
  };
}

async function setup(initial: string): Promise<{
  harness: Harness;
  peer: ReturnType<typeof makePeer>;
  ta: HTMLTextAreaElement;
}> {
  const peer = makePeer(initial);
  const harness = renderDraft();
  await connectAndSnapshot(harness, { snapshot: peer.snapshot });
  const ta = harness.textarea();
  expect(ta.value).toBe(initial);
  return { harness, peer, ta };
}

afterEach(() => {
  vi.useRealTimers();
});

// "hello world" => h0 e1 l2 l3 o4 (space)5 w6 o7 r8 l9 d10
describe("collaborative cursor position", () => {
  it("shifts the caret right when a peer inserts before it", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(5, 5);

    await deliverUpdate(harness, peer.edit((text) => text.insert(0, "XX")));

    expect(ta.value).toBe("XXhello world");
    expect(ta.selectionStart).toBe(7);
    expect(ta.selectionEnd).toBe(7);
  });

  it("keeps the caret when a peer inserts after it", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(5, 5);

    await deliverUpdate(harness, peer.edit((text) => text.insert(8, "ZZ")));

    expect(ta.value).toBe("hello woZZrld");
    expect(ta.selectionStart).toBe(5);
  });

  it("shifts the caret left when a peer deletes before it", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(8, 8);

    await deliverUpdate(harness, peer.edit((text) => text.delete(0, 3)));

    expect(ta.value).toBe("lo world");
    expect(ta.selectionStart).toBe(5);
  });

  it("clamps the caret to the edit boundary when a peer deletes across it", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(8, 8);

    // Delete indices 5..9 (" worl"), which spans the caret at 8.
    await deliverUpdate(harness, peer.edit((text) => text.delete(5, 5)));

    expect(ta.value).toBe("hellod");
    expect(ta.selectionStart).toBe(5);
    expect(ta.selectionStart).toBeLessThanOrEqual(ta.value.length);
  });

  it("keeps the caret stable when a peer inserts exactly at the caret", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(5, 5);

    await deliverUpdate(harness, peer.edit((text) => text.insert(5, "II")));

    expect(ta.value).toBe("helloII world");
    expect(ta.selectionStart).toBe(5);
  });

  it("preserves a non-collapsed selection across a peer insert before it", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(3, 8);

    await deliverUpdate(harness, peer.edit((text) => text.insert(0, "XX")));

    expect(ta.selectionStart).toBe(5);
    expect(ta.selectionEnd).toBe(10);
  });

  it("keeps the caret at the end when a peer appends", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(11, 11);

    await deliverUpdate(harness, peer.edit((text) => text.insert(11, " more")));

    expect(ta.value).toBe("hello world more");
    expect(ta.selectionStart).toBe(11);
  });

  it("clamps the caret within bounds when a peer deletes most of the text", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(11, 11);

    await deliverUpdate(harness, peer.edit((text) => text.delete(2, 9)));

    expect(ta.value).toBe("he");
    expect(ta.selectionStart).toBeLessThanOrEqual(ta.value.length);
    expect(ta.selectionStart).toBe(2);
  });

  it("does not restore the caret for a purely local edit", async () => {
    const { harness, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(5, 5);

    // A local edit must not snap the caret back via the remote-restore path,
    // because the hook only captures a cursor position for remote messages.
    act(() => {
      harness.api().onAnswerInputChange("helloX world");
    });

    expect(ta.value).toBe("helloX world");
    expect(ta.selectionStart).not.toBe(5);
  });

  it("does not attempt a restore when the textarea is not focused", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.blur();

    await expect(
      deliverUpdate(harness, peer.edit((text) => text.insert(0, "XX"))),
    ).resolves.toBeUndefined();

    expect(ta.value).toBe("XXhello world");
  });

  it("does not hijack a later local edit with a stale cursor from an unchanged remote message", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(9, 9);

    // Reconnect-style: the server re-sends the identical snapshot (no text change),
    // so no re-render happens and any captured cursor must not linger.
    await deliverSnapshot(harness, { snapshot: peer.full() });

    // The user moves the caret, then makes a local edit.
    ta.setSelectionRange(2, 2);
    act(() => {
      harness.api().onAnswerInputChange("hello worldX");
    });

    // The caret must not snap back to the stale captured index 9.
    expect(ta.selectionStart).not.toBe(9);
  });

  it("restores the caret after a snapshot merge changes the text", async () => {
    const { harness, peer, ta } = await setup("hello world");
    ta.focus();
    ta.setSelectionRange(5, 5);

    // A fresh full snapshot that shares history and inserts before the caret.
    peer.edit((text) => text.insert(0, "XX"));
    await deliverSnapshot(harness, { snapshot: peer.full() });

    expect(ta.value).toBe("XXhello world");
    expect(ta.selectionStart).toBe(7);
  });
});
