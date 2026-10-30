import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "../errors.js";
import { RoomsDb } from "./roomsDb.js";

describe("RoomsDb.deleteStaleRooms", () => {
  let roomsDb: RoomsDb;

  beforeEach(() => {
    roomsDb = new RoomsDb(":memory:");
    roomsDb.initializeSchema();
  });

  afterEach(() => {
    roomsDb.close();
  });

  it("deletes empty rooms last updated more than a day ago", () => {
    seedRoom(roomsDb, { id: "empty-old", answered: false, age: "-2 days" });
    seedRoom(roomsDb, { id: "empty-fresh", answered: false, age: "-12 hours" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 1, ids: ["empty-old"] });
    expect(remainingIds(roomsDb)).toEqual(["empty-fresh"]);
  });

  it("deletes non-empty rooms last updated more than a month ago, together with their answers", () => {
    seedRoom(roomsDb, { id: "used-old", answered: true, age: "-40 days" });
    seedRoom(roomsDb, { id: "used-recent", answered: true, age: "-20 days" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 1, ids: ["used-old"] });
    expect(remainingIds(roomsDb)).toEqual(["used-recent"]);
    expect(roomsDb.all("SELECT room_id FROM answers")).toEqual([{ room_id: "used-recent" }]);
  });

  it("treats a room as non-empty when only practice answers are present", () => {
    seedRoom(roomsDb, { id: "practice-old", answered: true, age: "-20 days", type: "practice" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 0, ids: [] });
  });

  it("keeps a freshly created empty room and a recently used room", () => {
    seedRoom(roomsDb, { id: "brand-new", answered: false, age: "-1 hours" });
    seedRoom(roomsDb, { id: "active", answered: true, age: "-2 days" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 0, ids: [] });
    expect(remainingIds(roomsDb).sort()).toEqual(["active", "brand-new"]);
  });

  it("retains owned rooms regardless of age and requires an existing owner", () => {
    roomsDb.run('INSERT INTO "user" (id, email, createdAt, updatedAt) VALUES (?, ?, 0, 0)', ["owner", "owner@example.com"]);
    roomsDb.addRoom({ roomId: "owned", ownerUserId: "owner" });
    roomsDb.run("UPDATE rooms SET updated_at = datetime('now', '-60 days') WHERE id = 'owned'");
    seedRoom(roomsDb, { id: "unowned", answered: true, age: "-40 days" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 1, ids: ["unowned"] });
    expect(remainingIds(roomsDb)).toEqual(["owned"]);
    expect(() => roomsDb.addRoom({ roomId: "bad", ownerUserId: "missing" })).toThrow(/FOREIGN KEY/);
  });
});

describe("RoomsDb answers", () => {
  let roomsDb: RoomsDb;
  const answer = (overrides: Partial<Parameters<RoomsDb["updateAnswer"]>[0]> = {}) => roomsDb.updateAnswer({
    roomId: "room", chapterId: "chapter-1", type: "theory", questionIndex: 0,
    user_answer: "answer", rating: 4, comment: "ok", baseRevision: 0, ...overrides,
  });

  beforeEach(() => {
    roomsDb = new RoomsDb(":memory:");
    roomsDb.initializeSchema();
    roomsDb.addRoom({ roomId: "room" });
  });

  afterEach(() => {
    roomsDb.close();
  });

  it("creates revision 1 and increments it on each matching update", () => {
    expect(answer()).toBe(1);
    expect(answer({ user_answer: "better", rating: 5, baseRevision: 1 })).toBe(2);
    expect(roomsDb.getChapterAnswers("room", "chapter-1")).toEqual({
      theory: [{ user_answer: "better", rating: 5, comment: "ok", revision: 2 }],
      practice: [],
    });
  });

  it("rejects a stale base revision without changing the answer", () => {
    answer();
    expect(() => answer({ user_answer: "stale", baseRevision: 0 })).toThrow(ConflictError);
    expect(() => roomsDb.assertAnswerRevision("room", "chapter-1", "theory", 0, 0)).toThrow(ConflictError);
    expect(() => roomsDb.assertAnswerRevision("room", "chapter-1", "theory", 0, 1)).not.toThrow();
    expect(roomsDb.getChapterAnswers("room", "chapter-1").theory[0]).toMatchObject({ user_answer: "answer", revision: 1 });
  });

  it("keeps the same question in different chapters and types independent", () => {
    answer();
    expect(answer({ chapterId: "chapter-2" })).toBe(1);
    expect(answer({ type: "practice" })).toBe(1);
    expect(roomsDb.getChapterAnswers("room", "chapter-2")).toEqual({
      theory: [{ user_answer: "answer", rating: 4, comment: "ok", revision: 1 }],
      practice: [],
    });
    expect(roomsDb.getChapterAnswers("room", "chapter-1").practice).toHaveLength(1);
  });

  it("returns sparse answers by question index", () => {
    answer({ questionIndex: 2 });
    const { theory } = roomsDb.getChapterAnswers("room", "chapter-1");
    expect(theory).toHaveLength(3);
    expect(theory[0]).toBeUndefined();
    expect(theory[2]).toMatchObject({ revision: 1 });
  });

  it("bumps the room's updated_at", () => {
    roomsDb.run("UPDATE rooms SET updated_at = '2020-01-01 00:00:00'");
    answer();
    expect(roomsDb.getRoom("room")?.updated_at).not.toBe("2020-01-01 00:00:00");
  });

  it("rejects answers for missing rooms", () => {
    expect(() => answer({ roomId: "missing" })).toThrow(NotFoundError);
    expect(() => roomsDb.assertAnswerRevision("missing", "chapter-1", "theory", 0, 0)).toThrow(NotFoundError);
  });

  it("deletes answers with their room", () => {
    roomsDb.run('INSERT INTO "user" (id, email, createdAt, updatedAt) VALUES (?, ?, 0, 0)', ["owner", "owner@example.com"]);
    roomsDb.addRoom({ roomId: "owned", ownerUserId: "owner" });
    answer({ roomId: "owned" });
    expect(roomsDb.deleteOwnedRoom("owned", "owner")).toBe(true);
    expect(roomsDb.all("SELECT * FROM answers WHERE room_id = 'owned'")).toEqual([]);
  });
});

describe("RoomsDb.hasRoomsTable", () => {
  it("reports whether the rooms table exists", () => {
    const roomsDb = new RoomsDb(":memory:");

    try {
      expect(roomsDb.hasRoomsTable()).toBe(false);
      roomsDb.initializeSchema();
      expect(roomsDb.hasRoomsTable()).toBe(true);
    } finally {
      roomsDb.close();
    }
  });
});

function seedRoom(
  roomsDb: RoomsDb,
  { id, answered, age, type = "theory" }: { id: string; answered: boolean; age: string; type?: "theory" | "practice" },
): void {
  roomsDb.addRoom({ roomId: id });
  if (answered) {
    roomsDb.updateAnswer({
      roomId: id, chapterId: "chapter-1", type, questionIndex: 0,
      user_answer: "an answer", rating: 5, comment: "ok", baseRevision: 0,
    });
  }
  roomsDb.run("UPDATE rooms SET updated_at = datetime('now', ?) WHERE id = ?", [age, id]);
}

function remainingIds(roomsDb: RoomsDb): string[] {
  return roomsDb.all<{ id: string }>("SELECT id FROM rooms ORDER BY id").map((row) => row.id);
}
