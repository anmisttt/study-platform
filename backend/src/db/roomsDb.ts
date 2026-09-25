import crypto from "crypto";
import Database from "better-sqlite3";
import type { QuestionType, RoomParticipationResult } from "@study-platform/shared";
import { ConflictError, NotFoundError, ServerError } from "../errors.js";
import { Db } from "./db.js";
import { DATABASE_SCHEMA } from "./schemas.js";
import type { AnswerFieldsJson, ProfileRoomRow, RoomsRow } from "./typings.js";

const ROOM_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ROOM_ID_LENGTH = 6;
const ROOM_CREATION_ATTEMPTS = 10;

class RoomIdCollisionError extends Error {}

const ANSWER_COLUMNS: Record<QuestionType, "theory_answers" | "practice_answers"> = {
  theory: "theory_answers",
  practice: "practice_answers",
};

export class RoomsDb extends Db {
  generateRoomId(): string {
    return Array.from({ length: ROOM_ID_LENGTH }, () =>
      ROOM_ID_CHARS[crypto.randomInt(ROOM_ID_CHARS.length)],
    ).join("");
  }

  createRoom({ chapterId, ownerUserId }: { chapterId: string; ownerUserId: string }): string {
    for (let attempt = 0; attempt < ROOM_CREATION_ATTEMPTS; attempt++) {
      const roomId = this.generateRoomId();
      try {
        this.addRoom({ roomId, chapterId, ownerUserId });
        return roomId;
      } catch (error) {
        // Only the room INSERT can produce this error. Participant failures and
        // write contention must not be mistaken for ID collisions.
        if (!(error instanceof RoomIdCollisionError)) throw error;
      }
    }

    throw new ServerError("Failed to generate unique room id");
  }

  addRoom({ roomId, chapterId, ownerUserId = null }: { roomId: string; chapterId: string; ownerUserId?: string | null }): void {
    this.db.transaction(() => {
      try {
        this.run("INSERT INTO rooms (id, chapter_id, owner_user_id) VALUES (?, ?, ?)", [roomId, chapterId, ownerUserId]);
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
    return this.all(`SELECT r.*, p.joined_at, p.last_opened_at
      FROM room_participants p JOIN rooms r ON r.id = p.room_id
      WHERE p.user_id = ? ORDER BY p.last_opened_at DESC, p.room_id`, [userId]);
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
    return this.all("SELECT * FROM rooms WHERE owner_user_id = ? ORDER BY updated_at DESC, id", [userId]);
  }

  deleteOwnedRoom(roomId: string, userId: string): boolean {
    return this.run("DELETE FROM rooms WHERE id = ? AND owner_user_id = ?", [roomId, userId]).changes > 0;
  }

  hasOwnerLlmKey(roomId: string): boolean {
    return Boolean(this.get("SELECT 1 FROM rooms r JOIN user_llm_credentials c ON c.user_id = r.owner_user_id WHERE r.id = ?", [roomId]));
  }

  assertAnswerRevision(roomId: string, type: QuestionType, index: number, revision: number): void {
    const room = this.getRoom(roomId);
    if (!room) throw new NotFoundError("Room not found.");
    const answers = JSON.parse(room[ANSWER_COLUMNS[type]]) as AnswerFieldsJson[];
    this.assertRevisionMatch(this.getItemRevision(answers[index]), revision);
  }

  getRoom(roomId: string): RoomsRow | undefined {
    return this.get("SELECT * FROM rooms WHERE id = ?", [roomId]);
  }

  updateAnswer({
    roomId,
    type,
    questionIndex,
    user_answer,
    rating,
    comment,
    baseRevision,
  }: {
    roomId: string;
    type: QuestionType;
    questionIndex: number;
    user_answer: string;
    rating: number;
    comment: string;
    baseRevision: number;
  }): number {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Room not found.");
    }

    const column = ANSWER_COLUMNS[type];
    const answers = JSON.parse(room[column]) as AnswerFieldsJson[];
    const currentRevision = this.getItemRevision(answers[questionIndex]);
    this.assertRevisionMatch(currentRevision, baseRevision);

    const nextRevision = currentRevision + 1;
    answers[questionIndex] = {
      user_answer,
      rating,
      comment,
      revision: nextRevision,
    };

    this.run(`UPDATE rooms SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`, [
      JSON.stringify(answers),
      roomId,
    ]);

    return nextRevision;
  }

  deleteStaleRooms(): { deleted: number; ids: string[] } {
    const emptyRoom = `json_array_length(theory_answers) = 0 AND json_array_length(practice_answers) = 0`;
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

  private getItemRevision(item: AnswerFieldsJson | undefined): number {
    return item?.revision ?? 0;
  }

  private assertRevisionMatch(currentRevision: number, baseRevision: number): void {
    if (currentRevision !== baseRevision) {
      throw new ConflictError("Question was updated by someone else.");
    }
  }

  initializeSchema(): void {
    this.db.transaction(() => this.db.exec(DATABASE_SCHEMA))();
  }

}
