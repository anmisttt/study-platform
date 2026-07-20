import { act, render } from "@testing-library/react";
import * as Y from "yjs";
import {
  useCollaborativeDraft,
} from "../hooks/useCollaborativeDraft";
import { installMockWebSocket, latestMockWebSocket, MockWebSocket } from "./mockWebSocket";

export type DraftApi = ReturnType<typeof useCollaborativeDraft>;

type HarnessProps = {
  apiBase: string;
  roomId: string | null;
  questionId: string | null;
  enabled: boolean;
};

export const API_BASE = "http://localhost/api";

/** base64-encode a Yjs update, mirroring the frontend wire format. */
export function encodeUpdate(update: Uint8Array): string {
  return Buffer.from(update).toString("base64");
}

/** Build a base64 snapshot/update whose answer text is `text`. */
export function buildAnswerUpdate(text: string): string {
  const doc = new Y.Doc();
  doc.getText("answer").insert(0, text);
  return encodeUpdate(Y.encodeStateAsUpdate(doc));
}

/**
 * Build a base64 *incremental* update representing a single edit applied on top
 * of a document that currently holds `base`. Useful to simulate a peer editing
 * shared text so relative offsets (and the cursor) behave realistically.
 */
export function buildEditUpdate(base: string, edit: (text: Y.Text) => void): string {
  const doc = new Y.Doc();
  const text = doc.getText("answer");
  if (base.length > 0) {
    text.insert(0, base);
  }
  const before = Y.encodeStateVector(doc);
  doc.transact(() => edit(text));
  return encodeUpdate(Y.encodeStateAsUpdate(doc, before));
}

export async function settle(ticks = 5): Promise<void> {
  await act(async () => {
    for (let index = 0; index < ticks; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

/** Wait until a condition holds, flushing async work (incl. IndexedDB) in between. */
export async function waitUntil(
  condition: () => boolean,
  attempts = 40,
): Promise<void> {
  await act(async () => {
    for (let index = 0; index < attempts; index += 1) {
      if (condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
  if (!condition()) {
    throw new Error("waitUntil condition was not met in time.");
  }
}

export type Harness = {
  api: () => DraftApi;
  ws: () => MockWebSocket;
  textarea: () => HTMLTextAreaElement;
  rerender: (props: Partial<HarnessProps>) => void;
  unmount: () => void;
};

export function renderDraft(initial: Partial<HarnessProps> = {}): Harness {
  installMockWebSocket();

  let currentApi: DraftApi | null = null;
  let props: HarnessProps = {
    apiBase: API_BASE,
    roomId: "room1",
    questionId: "practice-0",
    enabled: true,
    ...initial,
  };

  function Harness(p: HarnessProps) {
    const draft = useCollaborativeDraft(p);
    currentApi = draft;
    return (
      <textarea
        data-testid="answer"
        ref={draft.textareaRef}
        value={draft.answerInput}
        onChange={(event) => draft.onAnswerInputChange(event.target.value)}
      />
    );
  }

  const utils = render(<Harness {...props} />);

  return {
    api: () => {
      if (!currentApi) {
        throw new Error("Draft hook has not rendered yet.");
      }
      return currentApi;
    },
    ws: () => latestMockWebSocket(),
    textarea: () => utils.getByTestId("answer") as HTMLTextAreaElement,
    rerender: (next: Partial<HarnessProps>) => {
      props = { ...props, ...next };
      act(() => {
        utils.rerender(<Harness {...props} />);
      });
    },
    unmount: () => utils.unmount(),
  };
}

/** Open the mock socket and deliver the initial snapshot for a question. */
export async function connectAndSnapshot(
  harness: Harness,
  options: { roomId?: string; questionId?: string; snapshot?: string } = {},
): Promise<void> {
  const roomId = options.roomId ?? "room1";
  const questionId = options.questionId ?? "practice-0";
  const snapshot = options.snapshot ?? "";

  await act(async () => {
    harness.ws().simulateOpen();
    await Promise.resolve();
  });

  await act(async () => {
    harness.ws().simulateMessage(
      JSON.stringify({ type: "snapshot", roomId, questionId, update: snapshot }),
    );
    await Promise.resolve();
  });

  // applySnapshot is async (awaits IndexedDB); wait until it has hydrated.
  await waitUntil(() => harness.api().isDraftHydrated);
}

/** Deliver a `snapshot` message without re-opening the socket. */
export async function deliverSnapshot(
  harness: Harness,
  options: { roomId?: string; questionId?: string; snapshot?: string } = {},
): Promise<void> {
  const roomId = options.roomId ?? "room1";
  const questionId = options.questionId ?? "practice-0";
  const snapshot = options.snapshot ?? "";
  await act(async () => {
    harness.ws().simulateMessage(
      JSON.stringify({ type: "snapshot", roomId, questionId, update: snapshot }),
    );
    await Promise.resolve();
  });
  await waitUntil(() => harness.api().isDraftHydrated);
}

/** Deliver a remote `update` message to the hook. */
export async function deliverUpdate(
  harness: Harness,
  update: string,
  options: { roomId?: string; questionId?: string } = {},
): Promise<void> {
  const roomId = options.roomId ?? "room1";
  const questionId = options.questionId ?? "practice-0";
  await act(async () => {
    harness.ws().simulateMessage(JSON.stringify({ type: "update", roomId, questionId, update }));
    await Promise.resolve();
  });
}
