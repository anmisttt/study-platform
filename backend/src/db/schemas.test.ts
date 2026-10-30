import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoomsDb } from "./roomsDb.js";
import { SCHEMA_VERSION } from "./schemas.js";

it("preserves the schema, rooms, answers, and participation when reopening a database", () => {
  const directory = mkdtempSync(join(tmpdir(), "study-schema-"));
  const databasePath = join(directory, "rooms.sqlite");
  let db = new RoomsDb(databasePath);
  try {
    db.initializeSchema();
    for (const id of ["author", "participant"]) {
      db.run('INSERT INTO "user" (id, email, createdAt, updatedAt) VALUES (?, ?, 0, 0)', [id, `${id}@example.com`]);
    }
    db.addRoom({ roomId: "owned", ownerUserId: "author" });
    db.addRoom({ roomId: "unowned" });
    db.recordParticipation("owned", "participant");
    db.updateAnswer({ roomId: "owned", chapterId: "chapter", type: "theory", questionIndex: 0, user_answer: "saved theory", rating: 5, comment: "", baseRevision: 0 });
    db.updateAnswer({ roomId: "unowned", chapterId: "chapter", type: "practice", questionIndex: 1, user_answer: "saved practice", rating: 4, comment: "", baseRevision: 0 });
    db.run("UPDATE rooms SET updated_at = '2020-01-01 00:00:00'");
    db.run("UPDATE room_participants SET joined_at = '2020-01-01 00:00:00', last_opened_at = '2020-02-01 00:00:00'");
    const schema = db.all("SELECT * FROM sqlite_schema ORDER BY name");
    const users = db.all('SELECT * FROM "user" ORDER BY id');
    const rooms = db.all("SELECT * FROM rooms ORDER BY id");
    const participants = db.all("SELECT * FROM room_participants ORDER BY user_id, room_id");
    const answers = db.all("SELECT * FROM answers ORDER BY room_id");

    db.close();
    db = new RoomsDb(databasePath);
    db.initializeSchema();
    db.initializeSchema();

    expect(db.all("SELECT * FROM sqlite_schema ORDER BY name")).toEqual(schema);
    expect(db.all('SELECT * FROM "user" ORDER BY id')).toEqual(users);
    expect(db.all("SELECT * FROM rooms ORDER BY id")).toEqual(rooms);
    expect(db.all("SELECT * FROM room_participants ORDER BY user_id, room_id")).toEqual(participants);
    expect(db.all("SELECT * FROM answers ORDER BY room_id")).toEqual(answers);
    expect(db.connection.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.connection.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.connection.pragma("foreign_key_check")).toEqual([]);
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});

it("supports auth user writes without storing names", () => {
  const db = new RoomsDb(":memory:");
  try {
    db.initializeSchema();
    db.run(`INSERT INTO auth_user (id, auth_placeholder, email, createdAt, updatedAt)
      VALUES ('user', 'Discarded name', 'user@example.com', 0, 0)`);
    expect(db.get('SELECT * FROM "user"')).not.toHaveProperty("name");
    expect(db.get("SELECT auth_placeholder FROM auth_user")).toEqual({ auth_placeholder: "" });

    db.run("UPDATE auth_user SET auth_placeholder = 'Another name', email = 'updated@example.com', emailVerified = 1, updatedAt = 1");
    expect(db.get('SELECT * FROM "user"')).toEqual({
      id: "user", email: "updated@example.com", emailVerified: 1, image: null, createdAt: 0, updatedAt: 1,
    });
    expect(db.get("SELECT auth_placeholder FROM auth_user")).toEqual({ auth_placeholder: "" });

    db.run("DELETE FROM auth_user WHERE id = 'user'");
    expect(db.all('SELECT * FROM "user"')).toEqual([]);
  } finally { db.close(); }
});

describe("schema version", () => {
  it("creates a fresh database in its current shape", () => {
    const db = new RoomsDb(":memory:");
    try {
      db.initializeSchema();
      expect(db.all<{ name: string }>("PRAGMA table_info(rooms)").map((column) => column.name))
        .toEqual(["id", "created_at", "updated_at", "owner_user_id"]);
      expect(db.get("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'answers'")).toEqual({ name: "answers" });
      expect(db.connection.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    } finally { db.close(); }
  });

  it("refuses an older database without changing it", () => {
    const db = new RoomsDb(":memory:");
    try {
      db.connection.exec("CREATE TABLE rooms (id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL)");
      expect(() => db.initializeSchema()).toThrow(`Database schema version 0 is older than ${SCHEMA_VERSION}.`);
      expect(db.all("SELECT name FROM sqlite_schema WHERE type = 'table'")).toEqual([{ name: "rooms" }]);
    } finally { db.close(); }
  });
});
