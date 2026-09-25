import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { RoomsDb } from "./roomsDb.js";

it("preserves the schema, rooms, answers, and participation when reopening a database", () => {
  const directory = mkdtempSync(join(tmpdir(), "study-schema-"));
  const databasePath = join(directory, "rooms.sqlite");
  let db = new RoomsDb(databasePath);
  try {
    db.initializeSchema();
    for (const id of ["author", "participant"]) {
      db.run('INSERT INTO "user" (id, email, createdAt, updatedAt) VALUES (?, ?, 0, 0)', [id, `${id}@example.com`]);
    }
    db.addRoom({ roomId: "owned", chapterId: "chapter", ownerUserId: "author" });
    db.addRoom({ roomId: "unowned", chapterId: "chapter" });
    db.recordParticipation("owned", "participant");
    db.run("UPDATE rooms SET theory_answers = ?, practice_answers = ?, updated_at = '2020-01-01 00:00:00'", [
      '[{"user_answer":"saved theory","rating":5,"revision":2}]',
      '[{"user_answer":"saved practice","rating":4,"revision":1}]',
    ]);
    db.run("UPDATE room_participants SET joined_at = '2020-01-01 00:00:00', last_opened_at = '2020-02-01 00:00:00'");
    const schema = db.all("SELECT * FROM sqlite_schema ORDER BY name");
    const users = db.all('SELECT * FROM "user" ORDER BY id');
    const rooms = db.all("SELECT * FROM rooms ORDER BY id");
    const participants = db.all("SELECT * FROM room_participants ORDER BY user_id, room_id");

    db.close();
    db = new RoomsDb(databasePath);
    db.initializeSchema();
    db.initializeSchema();

    expect(db.all("SELECT * FROM sqlite_schema ORDER BY name")).toEqual(schema);
    expect(db.all('SELECT * FROM "user" ORDER BY id')).toEqual(users);
    expect(db.all("SELECT * FROM rooms ORDER BY id")).toEqual(rooms);
    expect(db.all("SELECT * FROM room_participants ORDER BY user_id, room_id")).toEqual(participants);
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
