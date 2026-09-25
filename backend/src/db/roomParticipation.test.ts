import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomsDb } from "./roomsDb.js";
import { NotFoundError } from "../errors.js";

function addUsers(db: RoomsDb) {
  for (const id of ["author", "participant", "other"]) {
    db.run('INSERT INTO "user" (id, email, createdAt, updatedAt) VALUES (?, ?, 0, 0)', [id, `${id}@example.com`]);
  }
}

describe("room participation", () => {
  let db: RoomsDb;
  beforeEach(() => { db = new RoomsDb(":memory:"); db.initializeSchema(); addUsers(db); });
  afterEach(() => { db.close(); vi.restoreAllMocks(); });

  it("creates the author's participation with the room and retains it on repeated opens", () => {
    const id = db.createRoom({ chapterId: "chapter", ownerUserId: "author" });
    const room = db.getRoom(id)!;
    expect(db.listParticipatedRooms("author")).toEqual([{ ...room, joined_at: room.created_at, last_opened_at: room.created_at }]);
    expect(db.recordParticipation(id, "author")).toEqual({ participationCreated: false });
    expect(db.listParticipatedRooms("author")).toHaveLength(1);
    expect(db.getRoom(id)).toEqual(room);
  });

  it("records users independently, preserves join time, and orders by each user's last open", () => {
    db.addRoom({ roomId: "owned", chapterId: "chapter", ownerUserId: "author" });
    db.addRoom({ roomId: "legacy", chapterId: "chapter" });
    const before = db.getRoom("owned");
    expect(db.recordParticipation("owned", "participant").participationCreated).toBe(true);
    expect(db.recordParticipation("legacy", "participant").participationCreated).toBe(true);
    db.run("UPDATE room_participants SET joined_at = '2020-01-01 00:00:00', last_opened_at = '2020-01-01 00:00:00' WHERE user_id = 'participant'");
    expect(db.listParticipatedRooms("participant").map(row => row.id)).toEqual(["legacy", "owned"]);
    expect(db.recordParticipation("owned", "participant").participationCreated).toBe(false);
    const rows = db.listParticipatedRooms("participant");
    expect(rows.map(row => row.id)).toEqual(["owned", "legacy"]);
    expect(rows[0].joined_at).toBe("2020-01-01 00:00:00");
    expect(rows[0].last_opened_at > rows[0].joined_at).toBe(true);
    expect(db.getRoom("owned")).toEqual(before);
    expect(db.listParticipatedRooms("author").map(row => row.id)).toEqual(["owned"]);
    expect(db.listParticipatedRooms("other")).toEqual([]);
    expect(db.getRoom("legacy")?.owner_user_id).toBeNull();
  });

  it("rejects missing rooms and users, and cascades deletion without granting ownership", () => {
    db.addRoom({ roomId: "room", chapterId: "chapter", ownerUserId: "author" });
    expect(() => db.recordParticipation("missing", "participant")).toThrow(NotFoundError);
    expect(() => db.recordParticipation("room", "missing-user")).toThrow(/FOREIGN KEY/);
    db.recordParticipation("room", "participant");
    db.recordParticipation("room", "other");
    expect(db.deleteOwnedRoom("room", "participant")).toBe(false);
    expect(db.listParticipatedRooms("participant")).toHaveLength(1);
    expect(() => db.run('DELETE FROM "user" WHERE id = ?', ["author"])).toThrow();
    db.run('DELETE FROM "user" WHERE id = ?', ["other"]);
    expect(db.listParticipatedRooms("other")).toEqual([]);
    expect(db.getRoom("room")).toBeDefined();
    expect(db.deleteOwnedRoom("room", "author")).toBe(true);
    expect(db.all("SELECT * FROM room_participants")).toEqual([]);
  });

  it("retries only room-ID collisions and does not alter the winning room", () => {
    db.addRoom({ roomId: "taken", chapterId: "chapter", ownerUserId: "other" });
    const original = db.getRoom("taken");
    const generate = vi.spyOn(db, "generateRoomId").mockReturnValueOnce("taken").mockReturnValue("fresh");
    expect(db.createRoom({ chapterId: "chapter", ownerUserId: "author" })).toBe("fresh");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(db.getRoom("taken")).toEqual(original);
    expect(db.listParticipatedRooms("author").map(row => row.id)).toEqual(["fresh"]);
    expect(db.listParticipatedRooms("other").map(row => row.id)).toEqual(["taken"]);
  });

  it("bounds collision retries and rolls back failed participant inserts", () => {
    db.addRoom({ roomId: "taken", chapterId: "chapter", ownerUserId: "other" });
    const generate = vi.spyOn(db, "generateRoomId").mockReturnValue("taken");
    expect(() => db.createRoom({ chapterId: "chapter", ownerUserId: "author" })).toThrow("Failed to generate unique room id");
    expect(generate).toHaveBeenCalledTimes(10);
    expect(db.connection.inTransaction).toBe(false);
    expect(db.listParticipatedRooms("author")).toEqual([]);
    generate.mockClear().mockReturnValue("failed");
    // Create a duplicate inside the participant INSERT so its PRIMARYKEY error
    // cannot accidentally be treated as a duplicate rooms.id.
    db.run(`CREATE TRIGGER fail_participant BEFORE INSERT ON room_participants
      BEGIN INSERT INTO room_participants (user_id, room_id) VALUES (NEW.user_id, NEW.room_id); END`);
    expect(() => db.createRoom({ chapterId: "chapter", ownerUserId: "author" })).toThrow(/room_participants/);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.getRoom("failed")).toBeUndefined();
    expect(db.connection.inTransaction).toBe(false);
    expect(db.listParticipatedRooms("author")).toEqual([]);
  });
});

it("treats a concurrent writer as busy rather than a room-ID collision", () => {
  const directory = mkdtempSync(join(tmpdir(), "room-participation-"));
  const first = new RoomsDb(join(directory, "rooms.sqlite"));
  const second = new RoomsDb(join(directory, "rooms.sqlite"));
  try {
    first.initializeSchema(); addUsers(first);
    second.connection.pragma("busy_timeout = 0");
    const generate = vi.spyOn(second, "generateRoomId").mockReturnValue("room");
    first.connection.exec("BEGIN IMMEDIATE");
    expect(() => second.createRoom({ chapterId: "chapter", ownerUserId: "author" })).toThrow(expect.objectContaining({ code: "SQLITE_BUSY" }));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(second.connection.inTransaction).toBe(false);
    first.connection.exec("ROLLBACK");
    expect(second.getRoom("room")).toBeUndefined();
    expect(second.createRoom({ chapterId: "chapter", ownerUserId: "author" })).toBe("room");
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true }); vi.restoreAllMocks(); }
});
