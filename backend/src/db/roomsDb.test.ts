import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoomsDb } from "./roomsDb";

const SAVED_ANSWER = JSON.stringify([
  { user_answer: "an answer", rating: 5, comment: "ok", revision: 1 },
]);

describe("RoomsDb.deleteStaleRooms", () => {
  let roomsDb: RoomsDb;

  beforeEach(() => {
    roomsDb = new RoomsDb(":memory:");
    roomsDb.createRoomsTable();
  });

  afterEach(() => {
    roomsDb.close();
  });

  it("deletes empty rooms last updated more than a day ago", () => {
    seedRoom(roomsDb, { id: "empty-old", answers: "[]", age: "-2 days" });
    seedRoom(roomsDb, { id: "empty-fresh", answers: "[]", age: "-12 hours" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 1, ids: ["empty-old"] });
    expect(remainingIds(roomsDb)).toEqual(["empty-fresh"]);
  });

  it("deletes non-empty rooms last updated more than a month ago", () => {
    seedRoom(roomsDb, { id: "used-old", answers: SAVED_ANSWER, age: "-40 days" });
    seedRoom(roomsDb, { id: "used-recent", answers: SAVED_ANSWER, age: "-20 days" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 1, ids: ["used-old"] });
    expect(remainingIds(roomsDb)).toEqual(["used-recent"]);
  });

  it("treats a room as non-empty when only practice answers are present", () => {
    roomsDb.addRoom({ roomId: "practice-old", chapterId: "chapter-1" });
    roomsDb.run(
      `UPDATE rooms SET practice_answers = ?, updated_at = datetime('now', ?) WHERE id = ?`,
      [SAVED_ANSWER, "-40 days", "practice-old"],
    );

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 1, ids: ["practice-old"] });
    expect(remainingIds(roomsDb)).toEqual([]);
  });

  it("keeps a freshly created empty room and a recently used room", () => {
    seedRoom(roomsDb, { id: "brand-new", answers: "[]", age: "-1 hours" });
    seedRoom(roomsDb, { id: "active", answers: SAVED_ANSWER, age: "-2 days" });

    expect(roomsDb.deleteStaleRooms()).toEqual({ deleted: 0, ids: [] });
    expect(remainingIds(roomsDb).sort()).toEqual(["active", "brand-new"]);
  });
});

describe("RoomsDb.hasRoomsTable", () => {
  it("reports whether the rooms table exists", () => {
    const roomsDb = new RoomsDb(":memory:");

    try {
      expect(roomsDb.hasRoomsTable()).toBe(false);
      roomsDb.createRoomsTable();
      expect(roomsDb.hasRoomsTable()).toBe(true);
    } finally {
      roomsDb.close();
    }
  });
});

function seedRoom(
  roomsDb: RoomsDb,
  { id, answers, age }: { id: string; answers: string; age: string },
): void {
  roomsDb.addRoom({ roomId: id, chapterId: "chapter-1" });
  roomsDb.run(`UPDATE rooms SET theory_answers = ?, updated_at = datetime('now', ?) WHERE id = ?`, [
    answers,
    age,
    id,
  ]);
}

function remainingIds(roomsDb: RoomsDb): string[] {
  return roomsDb.all<{ id: string }>("SELECT id FROM rooms ORDER BY id").map((row) => row.id);
}
