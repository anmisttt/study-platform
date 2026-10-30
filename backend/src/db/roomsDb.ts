import crypto from "crypto";
import Database from "better-sqlite3";
import type { QuestionType, RoomAnswerFields, RoomParticipationResult } from "@study-platform/shared";
import { ConflictError, NotFoundError, ServerError } from "../errors.js";
import { Db } from "./db.js";
import { DATABASE_SCHEMA, SCHEMA_VERSION } from "./schemas.js";
import type { ChapterAnswers, CheckedAnswerRow, ProfileRoomRow, RoomsRow } from "./typings.js";

const ROOM_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ROOM_ID_LENGTH = 6;
const ROOM_CREATION_ATTEMPTS = 10;

class RoomIdCollisionError extends Error {}

const ROOM_COLUMNS = "id, created_at, updated_at, owner_user_id";
const CHECKED_ANSWER_COLUMNS = "a.room_id, a.chapter_id, a.question_type, a.question_index, a.rating";
const IS_CHECKED = "a.user_answer <> '' AND a.rating IS NOT NULL";

export class RoomsDb extends Db {
  generateRoomId(): string {
    return Array.from({ length: ROOM_ID_LENGTH }, () =>
      ROOM_ID_CHARS[crypto.randomInt(ROOM_ID_CHARS.length)],
    ).join("");
  }

  createRoom({ ownerUserId }: { ownerUserId: string }): string {
    for (let attempt = 0; attempt < ROOM_CREATION_ATTEMPTS; attempt++) {
      const roomId = this.generateRoomId();
      try {
        this.addRoom({ roomId, ownerUserId });
        return roomId;
      } catch (error) {
        // Only the room INSERT can produce this error. Participant failures and
        // write contention must not be mistaken for ID collisions.
        if (!(error instanceof RoomIdCollisionError)) throw error;
      }
    }

    throw new ServerError("Failed to generate unique room id");
  }

  addRoom({ roomId, ownerUserId = null }: { roomId: string; ownerUserId?: string | null }): void {
    this.db.transaction(() => {
      try {
        this.run("INSERT INTO rooms (id, owner_user_id) VALUES (?, ?)", [roomId, ownerUserId]);
      } catch (error) {
        if (error instanceof Database.SqliteError && error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
          && error.message === "UNIQUE constraint failed: rooms.id") {
          throw new RoomIdCollisionError("Room ID already exists.", { cause: error });
        }
        throw error;
      }
      if (ownerUserId !== null) {
        this.run(`INSERT INTO room_participants (user_id, room_id, joined_at, last_opened_at)
          SELECT owner_user_id, id, created_at, created_at FROM rooms WHERE id = ?`, [roomId]);
      }
    })();
  }

  listParticipatedRooms(userId: string): ProfileRoomRow[] {
    return this.all(`SELECT r.id, r.created_at, r.updated_at, r.owner_user_id, p.joined_at, p.last_opened_at
      FROM room_participants p JOIN rooms r ON r.id = p.room_id
      WHERE p.user_id = ? ORDER BY p.last_opened_at DESC, p.room_id`, [userId]);
  }

  listParticipatedCheckedAnswers(userId: string): CheckedAnswerRow[] {
    return this.all(`SELECT ${CHECKED_ANSWER_COLUMNS}
      FROM room_participants p JOIN answers a ON a.room_id = p.room_id
      WHERE p.user_id = ? AND ${IS_CHECKED}`, [userId]);
  }

  listCheckedAnswers(roomId: string): CheckedAnswerRow[] {
    return this.all(`SELECT ${CHECKED_ANSWER_COLUMNS} FROM answers a WHERE a.room_id = ? AND ${IS_CHECKED}`, [roomId]);
  }

  recordParticipation(roomId: string, userId: string): RoomParticipationResult {
    return this.db.transaction(() => {
      const existing = this.get("SELECT 1 FROM room_participants WHERE user_id = ? AND room_id = ?", [userId, roomId]);
      const result = this.run(`INSERT INTO room_participants (user_id, room_id)
        SELECT ?, id FROM rooms WHERE id = ?
        ON CONFLICT (user_id, room_id) DO UPDATE
        SET last_opened_at = MAX(room_participants.last_opened_at, excluded.last_opened_at)`, [userId, roomId]);
      if (!result.changes) throw new NotFoundError("Room not found.");
      return { participationCreated: !existing };
    }).immediate();
  }

  listOwnedRooms(userId: string): RoomsRow[] {
    return this.all(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE owner_user_id = ? ORDER BY updated_at DESC, id`, [userId]);
  }

  deleteOwnedRoom(roomId: string, userId: string): boolean {
    return this.run("DELETE FROM rooms WHERE id = ? AND owner_user_id = ?", [roomId, userId]).changes > 0;
  }

  hasOwnerLlmKey(roomId: string): boolean {
    return Boolean(this.get("SELECT 1 FROM rooms r JOIN user_llm_credentials c ON c.user_id = r.owner_user_id WHERE r.id = ?", [roomId]));
  }

  assertAnswerRevision(roomId: string, chapterId: string, type: QuestionType, index: number, revision: number): void {
    if (!this.getRoom(roomId)) throw new NotFoundError("Room not found.");
    this.assertRevisionMatch(this.getAnswerRevision(roomId, chapterId, type, index), revision);
  }

  getRoom(roomId: string): RoomsRow | undefined {
    return this.get(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE id = ?`, [roomId]);
  }

  getChapterAnswers(roomId: string, chapterId: string): ChapterAnswers {
    const answers: ChapterAnswers = { theory: [], practice: [] };
    const rows = this.all<RoomAnswerFields & { question_type: QuestionType; question_index: number }>(
      `SELECT question_type, question_index, user_answer, rating, comment, revision
       FROM answers WHERE room_id = ? AND chapter_id = ?`, [roomId, chapterId]);
    for (const { question_type, question_index, ...fields } of rows) {
      answers[question_type][question_index] = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== null),
      );
    }
    return answers;
  }

  updateAnswer({
    roomId,
    chapterId,
    type,
    questionIndex,
    user_answer,
    rating,
    comment,
    baseRevision,
  }: {
    roomId: string;
    chapterId: string;
    type: QuestionType;
    questionIndex: number;
    user_answer: string;
    rating: number;
    comment: string;
    baseRevision: number;
  }): number {
    return this.db.transaction(() => {
      if (!this.getRoom(roomId)) {
        throw new NotFoundError("Room not found.");
      }

      const currentRevision = this.getAnswerRevision(roomId, chapterId, type, questionIndex);
      this.assertRevisionMatch(currentRevision, baseRevision);

      const nextRevision = currentRevision + 1;
      this.run(`INSERT INTO answers (room_id, chapter_id, question_type, question_index, user_answer, rating, comment, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (room_id, chapter_id, question_type, question_index) DO UPDATE
        SET user_answer = excluded.user_answer, rating = excluded.rating, comment = excluded.comment,
            revision = excluded.revision, updated_at = datetime('now')`,
      [roomId, chapterId, type, questionIndex, user_answer, rating, comment, nextRevision]);
      this.run("UPDATE rooms SET updated_at = datetime('now') WHERE id = ?", [roomId]);

      return nextRevision;
    }).immediate();
  }

  deleteStaleRooms(): { deleted: number; ids: string[] } {
    const emptyRoom = `NOT EXISTS (SELECT 1 FROM answers a WHERE a.room_id = rooms.id)`;
    const rows = this.all<{ id: string }>(
      `DELETE FROM rooms
       WHERE owner_user_id IS NULL AND ((
         (${emptyRoom})
         AND updated_at < datetime('now', '-1 day')
       ) OR (
         NOT (${emptyRoom})
         AND updated_at < datetime('now', '-1 month')
       ))
       RETURNING id`,
    );
    return { deleted: rows.length, ids: rows.map((row) => row.id) };
  }

  hasRoomsTable(): boolean {
    return (
      this.get("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'rooms'") !== undefined
    );
  }

  private getAnswerRevision(roomId: string, chapterId: string, type: QuestionType, index: number): number {
    return this.get<{ revision: number }>(
      `SELECT revision FROM answers
       WHERE room_id = ? AND chapter_id = ? AND question_type = ? AND question_index = ?`,
      [roomId, chapterId, type, index],
    )?.revision ?? 0;
  }

  private assertRevisionMatch(currentRevision: number, baseRevision: number): void {
    if (currentRevision !== baseRevision) {
      throw new ConflictError("Question was updated by someone else.");
    }
  }

  initializeSchema(): void {
    if (!this.hasRoomsTable()) {
      this.db.transaction(() => {
        this.db.exec(DATABASE_SCHEMA);
        this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
      })();
      return;
    }

    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version < SCHEMA_VERSION) {
      throw new Error(`Database schema version ${version} is older than ${SCHEMA_VERSION}. `
        + "Upgrade it by starting a release that still includes the answers-table migrations, then this one.");
    }
    this.db.transaction(() => this.db.exec(DATABASE_SCHEMA))();
  }
}
