import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { loadDraftUpdate, saveDraftUpdate } from "../utils/draftStorage";
import { MockWebSocket } from "../test/mockWebSocket";
import {
  buildAnswerUpdate,
  connectAndSnapshot,
  deliverSnapshot,
  deliverUpdate,
  renderDraft,
  settle,
} from "../test/draftHarness";

function bytesFor(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText("answer").insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useCollaborativeDraft", () => {
  it("does not open a socket when disabled or without a room", async () => {
    const disabled = renderDraft({ enabled: false });
    expect(MockWebSocket.instances.length).toBe(0);
    expect(disabled.api().answerInput).toBe("");
    disabled.unmount();

    const noRoom = renderDraft({ roomId: null });
    expect(MockWebSocket.instances.length).toBe(0);
    noRoom.unmount();
  });

  it("subscribes to the question once the socket opens", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    const subscribes = harness.ws().sentMessagesOfType("subscribe");
    expect(subscribes.length).toBeGreaterThanOrEqual(1);
    expect(subscribes[0]).toMatchObject({ roomId: "room1", questionId: "practice-0" });
  });

  it("reflects local edits in answerInput", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    act(() => {
      harness.api().onAnswerInputChange("hello world");
    });

    expect(harness.api().answerInput).toBe("hello world");
    expect(harness.textarea().value).toBe("hello world");
  });

  it("debounces rapid keystrokes into a single update send", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    const baseline = harness.ws().sentMessagesOfType("update").length;

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      harness.api().onAnswerInputChange("h");
      harness.api().onAnswerInputChange("he");
      harness.api().onAnswerInputChange("hel");
    });

    // Nothing is sent until the debounce window elapses.
    expect(harness.ws().sentMessagesOfType("update").length).toBe(baseline);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Three keystrokes collapse into exactly one flushed update.
    expect(harness.ws().sentMessagesOfType("update").length).toBe(baseline + 1);
  });

  it("applies a remote update to answerInput", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    await deliverUpdate(harness, buildAnswerUpdate("remote text"));

    expect(harness.api().answerInput).toBe("remote text");
  });

  it("merges a locally-persisted draft with an empty server snapshot without duplication", async () => {
    await saveDraftUpdate("room1", "practice-0", bytesFor("local draft"));

    const harness = renderDraft();
    await connectAndSnapshot(harness);
    await settle();

    expect(harness.api().answerInput).toBe("local draft");
  });

  it("resets the doc when switching questions and rehydrates on return", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    act(() => {
      harness.api().onAnswerInputChange("answer for q0");
    });
    await settle();

    // Switch to a different question.
    harness.rerender({ questionId: "practice-1" });
    await deliverSnapshot(harness, { questionId: "practice-1" });
    expect(harness.api().answerInput).toBe("");

    // Return to the original question; its draft should rehydrate from storage.
    harness.rerender({ questionId: "practice-0" });
    await deliverSnapshot(harness, { questionId: "practice-0" });
    await settle();
    expect(harness.api().answerInput).toBe("answer for q0");
  });

  it("clears the draft: empties text and clears storage", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    act(() => {
      harness.api().onAnswerInputChange("something to clear");
    });
    await settle();

    act(() => {
      harness.api().clearCollaborativeDraft();
    });
    await settle();

    expect(harness.api().answerInput).toBe("");
    expect(await loadDraftUpdate("room1", "practice-0")).toBeNull();
  });

  it("appends text with a separating space", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    act(() => {
      harness.api().onAnswerInputChange("hello");
    });
    act(() => {
      harness.api().appendDraftText("world");
    });

    expect(harness.api().answerInput).toBe("hello world");
  });

  it("reconnects and re-subscribes after the socket closes", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);
    expect(MockWebSocket.instances.length).toBe(1);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      harness.ws().simulateServerClose();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances.length).toBe(2);
    act(() => {
      harness.ws().simulateOpen();
    });
    expect(harness.ws().sentMessagesOfType("subscribe").length).toBeGreaterThanOrEqual(1);
  });

  it("reflects checking state from the server and broadcasts local checking", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    await act(async () => {
      harness.ws().simulateMessage(
        JSON.stringify({ type: "checking", roomId: "room1", questionId: "practice-0", checking: true }),
      );
      await Promise.resolve();
    });
    expect(harness.api().isAnswerChecking).toBe(true);

    act(() => {
      harness.api().setAnswerChecking(false);
    });
    const checkingSent = harness.ws().sentMessagesOfType("checking");
    expect(checkingSent.at(-1)).toMatchObject({ checking: false });
    expect(harness.api().isAnswerChecking).toBe(false);
  });
});
