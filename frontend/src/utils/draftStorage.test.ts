import { describe, expect, it } from "vitest";
import { loadDraftUpdate, saveDraftUpdate } from "./draftStorage";

const DB_NAME = "study-platform.drafts";
const STORE_NAME = "drafts";

function seedVersionOneDraft(key: string, update: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to seed draft database."));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ key, update });
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to seed draft."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Failed to seed draft."));
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

describe("draftStorage schema upgrades", () => {
  it("discards version-one drafts before storing one-based question refs", async () => {
    const collidingKey = "room1:practice-1";
    await seedVersionOneDraft(collidingKey, new Uint8Array([1, 2, 3]));

    expect(await loadDraftUpdate("room1", "practice-1")).toBeNull();

    const newDraft = new Uint8Array([4, 5, 6]);
    await saveDraftUpdate("room1", "practice-1", newDraft);
    expect(Array.from((await loadDraftUpdate("room1", "practice-1")) ?? [])).toEqual(
      Array.from(newDraft),
    );
  });
});
