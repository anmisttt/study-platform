import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { loadDraftUpdate, saveDraftUpdate } from "../utils/draftStorage";
import { MockWebSocket } from "../test/mockWebSocket";
import { roomDetails } from "../test/fixtures";
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

  it("does not expose stale draft state after being disabled and re-enabled", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    act(() => {
      harness.api().onAnswerInputChange("stale draft");
    });
    expect(harness.api().answerInput).toBe("stale draft");

    harness.rerender({ enabled: false });
    expect(harness.api().answerInput).toBe("");
    expect(harness.api().isDraftHydrated).toBe(false);

    harness.rerender({ enabled: true });
    expect(harness.api().answerInput).toBe("");
    expect(harness.api().isDraftHydrated).toBe(false);
  });

  it("connects to the room URL and watches the question once the socket opens", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    expect(harness.ws().url).toBe("ws://localhost/api/ws/rooms/room1");
    expect(harness.ws().sentMessagesOfType("watch_question").at(-1)).toEqual({
      type: "watch_question",
      questionId: "practice-0",
    });
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
    expect(harness.ws().sentMessagesOfType("update").at(-1)).toMatchObject({
      type: "update",
      questionId: "practice-0",
    });
    expect(harness.ws().sentMessagesOfType("update").at(-1)).not.toHaveProperty("roomId");
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
    expect(harness.ws().sentMessagesOfType("watch_question").at(-1)).toEqual({
      type: "watch_question",
      questionId: "practice-1",
    });
    await deliverSnapshot(harness, { questionId: "practice-1" });
    expect(harness.api().answerInput).toBe("");
    expect(MockWebSocket.instances).toHaveLength(1);

    // Return to the original question; its draft should rehydrate from storage.
    harness.rerender({ questionId: "practice-0" });
    await deliverSnapshot(harness, { questionId: "practice-0" });
    await settle();
    expect(harness.api().answerInput).toBe("answer for q0");
  });

  it("opens a new room-scoped socket when switching rooms", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);
    const socket = harness.ws();

    act(() => {
      harness.api().onAnswerInputChange("room one draft");
    });

    harness.rerender({ roomId: "room2" });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    expect(socket.sentMessagesOfType("update").at(-1)).toMatchObject({
      type: "update",
      questionId: "practice-0",
    });
    expect(harness.ws()).not.toBe(socket);
    expect(harness.ws().url).toBe("ws://localhost/api/ws/rooms/room2");

    act(() => {
      harness.ws().simulateOpen();
    });
    expect(harness.ws().sentMessagesOfType("watch_question")).toEqual([
      { type: "watch_question", questionId: "practice-0" },
    ]);

    await deliverSnapshot(harness);
    expect(harness.api().answerInput).toBe("");
  });

  it("delivers room snapshots without replacing the room connection", async () => {
    const onRoomSnapshot = vi.fn();
    const harness = renderDraft({ roomId: roomDetails.roomId, onRoomSnapshot });
    await connectAndSnapshot(harness);

    await act(async () => {
      harness.ws().simulateMessage(JSON.stringify({ type: "room_snapshot", room: roomDetails }));
      await Promise.resolve();
    });

    expect(onRoomSnapshot).toHaveBeenCalledWith(roomDetails);
    harness.rerender({ questionId: "practice-1" });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("reports room connection errors", async () => {
    const onRoomError = vi.fn();
    const harness = renderDraft({ onRoomError });
    await connectAndSnapshot(harness);

    act(() => {
      harness.ws().simulateMessage(JSON.stringify({ type: "error", message: "Room not found." }));
    });

    expect(onRoomError).toHaveBeenCalledWith("Room not found.");
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

  it("reconnects to the room URL and watches the question again", async () => {
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
    expect(harness.ws().url).toBe("ws://localhost/api/ws/rooms/room1");
    expect(harness.ws().sentMessagesOfType("watch_question").at(-1)).toEqual({
      type: "watch_question",
      questionId: "practice-0",
    });
  });

  it("reflects checking state from the server and broadcasts local checking", async () => {
    const harness = renderDraft();
    await connectAndSnapshot(harness);

    await act(async () => {
      harness.ws().simulateMessage(
        JSON.stringify({ type: "checking", questionId: "practice-0", checking: true }),
      );
      await Promise.resolve();
    });
    expect(harness.api().isAnswerChecking).toBe(true);

    act(() => {
      harness.api().setAnswerChecking(false);
    });
    const checkingSent = harness.ws().sentMessagesOfType("checking");
    expect(checkingSent.at(-1)).toEqual({
      type: "checking",
      questionId: "practice-0",
      checking: false,
    });
    expect(harness.api().isAnswerChecking).toBe(false);
  });
});
