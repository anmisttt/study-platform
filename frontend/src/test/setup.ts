import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Give every test a clean IndexedDB so persisted drafts never leak between tests.
beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

afterEach(() => {
  cleanup();
});
