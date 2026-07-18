import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  DRAFT_YTEXT_NAME,
  type DraftServerMessage,
  type DraftSnapshotMessage,
} from "@study-platform/shared";
import {
  clearDraftUpdate,
  loadDraftUpdate,
  saveDraftUpdate,
} from "../utils/draftStorage";
import { draftWebSocketUrl } from "../utils/draftWebSocketUrl";
import { updateYText } from "../utils/yTextBinding";

const DRAFT_SEND_DEBOUNCE_MS = 1000;
const WS_RECONNECT_DELAY_MS = 1000;

function closeDraftWebSocket(ws: WebSocket): void {
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;

  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
    return;
  }

  if (ws.readyState === WebSocket.CONNECTING) {
    ws.onopen = () => {
      ws.close();
    };
  }
}

function encodeUpdateBase64(update: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < update.length; index += 1) {
    binary += String.fromCharCode(update[index]!);
  }
  return btoa(binary);
}

function decodeUpdateBase64(updateBase64: string): Uint8Array {
  const binary = atob(updateBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseServerMessage(raw: string): DraftServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const message = parsed as Record<string, unknown>;
    if (
      (message.type === "snapshot" || message.type === "update") &&
      typeof message.roomId === "string" &&
      typeof message.questionId === "string" &&
      typeof message.update === "string"
    ) {
      return message as DraftServerMessage;
    }

    if (
      message.type === "checking" &&
      typeof message.roomId === "string" &&
      typeof message.questionId === "string" &&
      typeof message.checking === "boolean"
    ) {
      return message as DraftServerMessage;
    }

    if (message.type === "error" && typeof message.message === "string") {
      return message as DraftServerMessage;
    }

    return null;
  } catch (error: unknown) {
    console.error("Failed to parse server draft message:", error);
    return null;
  }
}

type UseCollaborativeDraftOptions = {
  apiBase: string;
  roomId: string | null;
  questionId: string | null;
  enabled: boolean;
};

type UseCollaborativeDraftResult = {
  answerInput: string;
  isDraftHydrated: boolean;
  isAnswerChecking: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onAnswerInputChange: (value: string) => void;
  appendDraftText: (text: string, existingFallback?: string) => void;
  clearCollaborativeDraft: () => void;
  setAnswerChecking: (checking: boolean) => void;
  clearLocalAnswerChecking: () => void;
};

export function useCollaborativeDraft({
  apiBase,
  roomId,
  questionId,
  enabled,
}: UseCollaborativeDraftOptions): UseCollaborativeDraftResult {
  const [answerInput, setAnswerInput] = useState("");
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [isAnswerChecking, setIsAnswerChecking] = useState(false);
  const docRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCursorRestoreRef = useRef<{
    start: Y.RelativePosition;
    end: Y.RelativePosition;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeQuestionRef = useRef<string | null>(null);
  const lastSentStateVectorRef = useRef<Uint8Array | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemoteUpdateRef = useRef(false);
  const snapshotReceivedRef = useRef(false);
  const suppressPersistRef = useRef(false);
  const docPersistCleanupRef = useRef<(() => void) | null>(null);
  const snapshotGenerationRef = useRef(0);
  const roomIdRef = useRef(roomId);
  const questionIdRef = useRef(questionId);

  roomIdRef.current = roomId;
  questionIdRef.current = questionId;

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const detachDocPersistence = useCallback(() => {
    docPersistCleanupRef.current?.();
    docPersistCleanupRef.current = null;
  }, []);

  const bindDocPersistence = useCallback((doc: Y.Doc, activeRoomId: string, activeQuestionId: string) => {
    detachDocPersistence();

    const onUpdate = () => {
      if (suppressPersistRef.current) {
        return;
      }

      void saveDraftUpdate(activeRoomId, activeQuestionId, Y.encodeStateAsUpdate(doc));
    };

    doc.on("update", onUpdate);
    docPersistCleanupRef.current = () => {
      doc.off("update", onUpdate);
    };
  }, [detachDocPersistence]);

  const flushPendingUpdate = useCallback(() => {
    const ws = wsRef.current;
    const doc = docRef.current;
    const activeRoomId = roomIdRef.current;
    const activeQuestionId = activeQuestionRef.current;

    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      !doc ||
      !activeRoomId ||
      !activeQuestionId ||
      !snapshotReceivedRef.current
    ) {
      return;
    }

    const update = lastSentStateVectorRef.current
      ? Y.encodeStateAsUpdate(doc, lastSentStateVectorRef.current)
      : Y.encodeStateAsUpdate(doc);

    if (update.length === 0) {
      lastSentStateVectorRef.current = Y.encodeStateVector(doc);
      return;
    }

    ws.send(
      JSON.stringify({
        type: "update",
        roomId: activeRoomId,
        questionId: activeQuestionId,
        update: encodeUpdateBase64(update),
      }),
    );
    lastSentStateVectorRef.current = Y.encodeStateVector(doc);
  }, []);

  const schedulePendingUpdate = useCallback(() => {
    clearDebounceTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      flushPendingUpdate();
    }, DRAFT_SEND_DEBOUNCE_MS);
  }, [clearDebounceTimer, flushPendingUpdate]);

  const syncAnswerFromYText = useCallback(() => {
    const ytext = ytextRef.current;
    if (!ytext) {
      return;
    }

    setAnswerInput(ytext.toString());
  }, []);

  // Capture the local caret as Yjs relative positions before a remote update is
  // applied, so it can be restored afterwards instead of jumping to the end of
  // the textarea when React replaces the controlled value.
  const captureCursorBeforeRemoteUpdate = useCallback(() => {
    const textarea = textareaRef.current;
    const ytext = ytextRef.current;
    if (!textarea || !ytext) {
      return;
    }

    if (typeof document !== "undefined" && document.activeElement !== textarea) {
      pendingCursorRestoreRef.current = null;
      return;
    }

    const start = Math.min(textarea.selectionStart, ytext.length);
    const end = Math.min(textarea.selectionEnd, ytext.length);

    pendingCursorRestoreRef.current = {
      start: Y.createRelativePositionFromTypeIndex(ytext, start, -1),
      end: Y.createRelativePositionFromTypeIndex(ytext, end, -1),
    };
  }, []);

  const applyLocalDraftUpdate = useCallback(
    (update: Uint8Array) => {
      const doc = docRef.current;
      if (!doc || update.length === 0) {
        return;
      }

      suppressPersistRef.current = true;
      applyingRemoteUpdateRef.current = true;
      Y.applyUpdate(doc, update);
      applyingRemoteUpdateRef.current = false;
      suppressPersistRef.current = false;
      lastSentStateVectorRef.current = Y.encodeStateVector(doc);
      syncAnswerFromYText();
      setIsDraftHydrated(true);
    },
    [syncAnswerFromYText],
  );

  const resetQuestionDoc = useCallback(() => {
    detachDocPersistence();
    const doc = new Y.Doc();
    const ytext = doc.getText(DRAFT_YTEXT_NAME);
    docRef.current = doc;
    ytextRef.current = ytext;
    lastSentStateVectorRef.current = Y.encodeStateVector(doc);
    setAnswerInput("");
    setIsDraftHydrated(false);
    setIsAnswerChecking(false);
  }, [detachDocPersistence]);

  const applySnapshot = useCallback(
    async (message: DraftSnapshotMessage) => {
      const activeRoomId = roomIdRef.current;
      const activeQuestionId = activeQuestionRef.current;
      if (!activeRoomId || !activeQuestionId) {
        return;
      }

      if (message.roomId !== activeRoomId || message.questionId !== activeQuestionId) {
        return;
      }

      const generation = snapshotGenerationRef.current + 1;
      snapshotGenerationRef.current = generation;

      const serverUpdate = decodeUpdateBase64(message.update);
      const localUpdate = await loadDraftUpdate(activeRoomId, activeQuestionId);

      if (
        snapshotGenerationRef.current !== generation ||
        activeQuestionRef.current !== activeQuestionId ||
        roomIdRef.current !== activeRoomId
      ) {
        return;
      }

      const serverDoc = new Y.Doc();
      serverDoc.getText(DRAFT_YTEXT_NAME);
      if (serverUpdate.length > 0) {
        Y.applyUpdate(serverDoc, serverUpdate);
      }
      const serverStateVector = Y.encodeStateVector(serverDoc);

      suppressPersistRef.current = true;
      detachDocPersistence();

      const mergedDoc = new Y.Doc();
      mergedDoc.getText(DRAFT_YTEXT_NAME);

      if (localUpdate && localUpdate.length > 0) {
        Y.applyUpdate(mergedDoc, localUpdate);
      }

      if (serverUpdate.length > 0) {
        applyingRemoteUpdateRef.current = true;
        Y.applyUpdate(mergedDoc, serverUpdate);
        applyingRemoteUpdateRef.current = false;
      }

      const currentDoc = docRef.current;
      if (currentDoc) {
        const currentUpdate = Y.encodeStateAsUpdate(currentDoc);
        if (currentUpdate.length > 0) {
          applyingRemoteUpdateRef.current = true;
          Y.applyUpdate(mergedDoc, currentUpdate);
          applyingRemoteUpdateRef.current = false;
        }
      }

      docRef.current = mergedDoc;
      ytextRef.current = mergedDoc.getText(DRAFT_YTEXT_NAME);
      lastSentStateVectorRef.current = serverStateVector;
      snapshotReceivedRef.current = true;
      suppressPersistRef.current = false;

      bindDocPersistence(mergedDoc, activeRoomId, activeQuestionId);
      syncAnswerFromYText();
      setIsDraftHydrated(true);

      const mergedUpdate = Y.encodeStateAsUpdate(mergedDoc);
      if (mergedUpdate.length > 0 || serverUpdate.length > 0) {
        await saveDraftUpdate(activeRoomId, activeQuestionId, mergedUpdate);
      }

      if (
        snapshotGenerationRef.current !== generation ||
        activeQuestionRef.current !== activeQuestionId ||
        roomIdRef.current !== activeRoomId
      ) {
        return;
      }

      clearDebounceTimer();
      flushPendingUpdate();
    },
    [bindDocPersistence, clearDebounceTimer, detachDocPersistence, flushPendingUpdate, syncAnswerFromYText],
  );

  const subscribeToQuestion = useCallback(
    (activeRoomId: string, activeQuestionId: string) => {
      if (activeQuestionRef.current !== activeQuestionId) {
        clearDebounceTimer();
        flushPendingUpdate();
        snapshotGenerationRef.current += 1;
        activeQuestionRef.current = activeQuestionId;
        snapshotReceivedRef.current = false;
        resetQuestionDoc();

        void loadDraftUpdate(activeRoomId, activeQuestionId).then((update) => {
          if (
            activeQuestionRef.current !== activeQuestionId ||
            roomIdRef.current !== activeRoomId ||
            !update ||
            update.length === 0
          ) {
            return;
          }

          applyLocalDraftUpdate(update);
        });
      }

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      snapshotReceivedRef.current = false;
      ws.send(
        JSON.stringify({
          type: "subscribe",
          roomId: activeRoomId,
          questionId: activeQuestionId,
        }),
      );
    },
    [applyLocalDraftUpdate, clearDebounceTimer, flushPendingUpdate, resetQuestionDoc],
  );

  const handleServerMessage = useCallback(
    (message: DraftServerMessage) => {
      const activeRoomId = roomIdRef.current;
      const activeQuestionId = activeQuestionRef.current;
      const doc = docRef.current;
      const ytext = ytextRef.current;

      if (!activeRoomId || !activeQuestionId || !doc || !ytext) {
        return;
      }

      if (message.type === "error") {
        return;
      }

      if (message.roomId !== activeRoomId || message.questionId !== activeQuestionId) {
        return;
      }

      if (message.type === "snapshot") {
        captureCursorBeforeRemoteUpdate();
        void applySnapshot(message);
        return;
      }

      if (message.type === "checking") {
        setIsAnswerChecking(message.checking);
        return;
      }

      captureCursorBeforeRemoteUpdate();
      applyingRemoteUpdateRef.current = true;
      Y.applyUpdate(doc, decodeUpdateBase64(message.update));
      applyingRemoteUpdateRef.current = false;
      syncAnswerFromYText();
    },
    [applySnapshot, captureCursorBeforeRemoteUpdate, syncAnswerFromYText],
  );

  useEffect(() => {
    if (!enabled || !roomId) {
      clearDebounceTimer();
      detachDocPersistence();
      if (wsRef.current) {
        closeDraftWebSocket(wsRef.current);
        wsRef.current = null;
      }
      activeQuestionRef.current = null;
      docRef.current = null;
      ytextRef.current = null;
      lastSentStateVectorRef.current = null;
      snapshotReceivedRef.current = false;
      snapshotGenerationRef.current += 1;
      setAnswerInput("");
      setIsDraftHydrated(false);
      setIsAnswerChecking(false);
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let activeWs: WebSocket | null = null;

    const connect = () => {
      if (disposed) {
        return;
      }

      const ws = new WebSocket(draftWebSocketUrl(apiBase));
      activeWs = ws;
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }

        if (questionIdRef.current) {
          subscribeToQuestion(roomId, questionIdRef.current);
        }
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const message = parseServerMessage(event.data);
        if (!message) {
          return;
        }

        handleServerMessage(message);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (activeWs === ws) {
          activeWs = null;
        }
        snapshotReceivedRef.current = false;

        if (disposed) {
          return;
        }

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, WS_RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      clearDebounceTimer();
      flushPendingUpdate();
      if (activeWs) {
        closeDraftWebSocket(activeWs);
      }
      if (wsRef.current === activeWs) {
        wsRef.current = null;
      }
      snapshotReceivedRef.current = false;
    };
  }, [
    apiBase,
    clearDebounceTimer,
    detachDocPersistence,
    enabled,
    flushPendingUpdate,
    handleServerMessage,
    roomId,
    subscribeToQuestion,
  ]);

  useEffect(() => {
    if (!enabled || !roomId || !questionId) {
      return;
    }

    subscribeToQuestion(roomId, questionId);
  }, [enabled, questionId, roomId, subscribeToQuestion]);

  // Restore the caret after a remote update re-renders the textarea. The
  // relative positions resolve to the correct absolute offsets even if the
  // remote change inserted or deleted text before the caret.
  useLayoutEffect(() => {
    const pending = pendingCursorRestoreRef.current;
    if (!pending) {
      return;
    }
    pendingCursorRestoreRef.current = null;

    const textarea = textareaRef.current;
    const doc = docRef.current;
    if (!textarea || !doc) {
      return;
    }

    const startAbs = Y.createAbsolutePositionFromRelativePosition(pending.start, doc);
    const endAbs = Y.createAbsolutePositionFromRelativePosition(pending.end, doc);
    const length = textarea.value.length;
    const start = startAbs ? Math.min(startAbs.index, length) : length;
    const end = endAbs ? Math.min(endAbs.index, length) : length;

    try {
      textarea.setSelectionRange(start, end);
    } catch {
      // The textarea may be detached or of an unsupported type; ignore.
    }
  }, [answerInput]);

  const onAnswerInputChange = useCallback(
    (value: string) => {
      const ytext = ytextRef.current;
      const doc = docRef.current;
      if (!ytext || !doc || !enabled) {
        return;
      }

      doc.transact(() => {
        updateYText(ytext, value);
      });

      setAnswerInput(ytext.toString());
      schedulePendingUpdate();
    },
    [enabled, schedulePendingUpdate],
  );

  const appendDraftText = useCallback(
    (text: string, existingFallback = "") => {
      const ytext = ytextRef.current;
      const doc = docRef.current;
      if (!ytext || !doc || !enabled) {
        return;
      }

      const current = ytext.toString() || existingFallback;
      const nextValue = current ? `${current} ${text}` : text;

      doc.transact(() => {
        updateYText(ytext, nextValue);
      });

      setAnswerInput(ytext.toString());
      schedulePendingUpdate();
    },
    [enabled, schedulePendingUpdate],
  );

  const clearCollaborativeDraft = useCallback(() => {
    const ytext = ytextRef.current;
    const doc = docRef.current;
    const activeRoomId = roomIdRef.current;
    const activeQuestionId = questionIdRef.current;

    clearDebounceTimer();

    if (ytext && doc) {
      suppressPersistRef.current = true;
      doc.transact(() => {
        if (ytext.length > 0) {
          ytext.delete(0, ytext.length);
        }
      });
      suppressPersistRef.current = false;
      lastSentStateVectorRef.current = Y.encodeStateVector(doc);
      flushPendingUpdate();
    }

    if (activeRoomId && activeQuestionId) {
      void clearDraftUpdate(activeRoomId, activeQuestionId);
    }

    setAnswerInput("");
  }, [clearDebounceTimer, flushPendingUpdate]);

  const setAnswerChecking = useCallback((checking: boolean) => {
    const activeRoomId = roomIdRef.current;
    const activeQuestionId = questionIdRef.current;
    const ws = wsRef.current;

    setIsAnswerChecking(checking);

    if (!ws || ws.readyState !== WebSocket.OPEN || !activeRoomId || !activeQuestionId) {
      return;
    }

    ws.send(
      JSON.stringify({
        type: "checking",
        roomId: activeRoomId,
        questionId: activeQuestionId,
        checking,
      }),
    );
  }, []);

  const clearLocalAnswerChecking = useCallback(() => {
    setIsAnswerChecking(false);
  }, []);

  return {
    answerInput,
    isDraftHydrated,
    isAnswerChecking,
    textareaRef,
    onAnswerInputChange,
    appendDraftText,
    clearCollaborativeDraft,
    setAnswerChecking,
    clearLocalAnswerChecking,
  };
}
