const DB_NAME = "study-platform.drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

type DraftRecord = {
  key: string;
  update: Uint8Array;
};

const persistedDraftKeys = new Set<string>();

function draftKey(roomId: string, questionId: string): string {
  return `${roomId}:${questionId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open draft IndexedDB."));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Draft IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Draft IndexedDB transaction aborted."));
  });
}

function readRecord(db: IDBDatabase, key: string): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);

    request.onsuccess = () => {
      const record = request.result as DraftRecord | undefined;
      resolve(record?.update ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to read draft from IndexedDB."));
  });
}

export function hasPersistedDraft(roomId: string, questionId: string): boolean {
  return persistedDraftKeys.has(draftKey(roomId, questionId));
}

export async function loadDraftUpdate(roomId: string, questionId: string): Promise<Uint8Array | null> {
  const key = draftKey(roomId, questionId);
  const db = await openDb();

  try {
    const storedUpdate = await readRecord(db, key);
    if (storedUpdate && storedUpdate.length > 0) {
      persistedDraftKeys.add(key);
      return storedUpdate;
    }
  } finally {
    db.close();
  }

  return null;
}

export async function saveDraftUpdate(roomId: string, questionId: string, update: Uint8Array): Promise<void> {
  const key = draftKey(roomId, questionId);
  const db = await openDb();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    if (update.length === 0) {
      store.delete(key);
      persistedDraftKeys.delete(key);
    } else {
      store.put({ key, update } satisfies DraftRecord);
      persistedDraftKeys.add(key);
    }

    await waitForTransaction(transaction);
  } finally {
    db.close();
  }
}

export async function clearDraftUpdate(roomId: string, questionId: string): Promise<void> {
  await saveDraftUpdate(roomId, questionId, new Uint8Array());
}

export async function clearRoomDraftUpdates(roomId: string): Promise<void> {
  const db = await openDb();
  const prefix = `${roomId}:`;

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }

      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
        cursor.delete();
        persistedDraftKeys.delete(cursor.key);
      }

      cursor.continue();
    };

    await waitForTransaction(transaction);
  } finally {
    db.close();
  }
}

export function isEditingQuestion(
  roomId: string | null,
  questionId: string,
  session: { drafts: Record<string, string> },
): boolean {
  if (roomId && hasPersistedDraft(roomId, questionId)) {
    return true;
  }

  return questionId in session.drafts;
}

export function resolveAnswerInput(
  _roomId: string | null,
  questionId: string,
  session: { drafts: Record<string, string>; responses: Record<string, { answer: string }> },
): string {
  if (questionId in session.drafts) {
    return session.drafts[questionId];
  }

  return session.responses[questionId]?.answer ?? "";
}
