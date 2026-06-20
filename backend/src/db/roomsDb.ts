import crypto from "crypto";
import { ConflictError, NotFoundError, ServerError } from "../errors";
import { Db } from "./db";
import { ROOMS_TABLE_SCHEMA } from "./schemas";
import type { AnswerFieldsJson, RoomsRow } from "./typings";

const ROOM_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ROOM_ID_LENGTH = 6;

export class RoomsDb extends Db {
  constructor(dbPath?: string) {
    super(dbPath);
    this.createRoomsTable();
  }

  generateRoomId(): string {
    return Array.from({ length: ROOM_ID_LENGTH }, () =>
      ROOM_ID_CHARS[crypto.randomInt(ROOM_ID_CHARS.length)],
    ).join("");
  }

  generateUniqueRoomId(): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = this.generateRoomId();
      if (!this.isRoomIdTaken(id)) {
        return id;
      }
    }

    throw new ServerError("Failed to generate unique room id");
  }

  addRoom({ roomId, chapterId }: { roomId: string; chapterId: string }): void {
    this.run("INSERT INTO rooms (id, chapter_id) VALUES (?, ?)", [roomId, chapterId]);
  }

  getRoom(roomId: string): RoomsRow | undefined {
    return this.get("SELECT * FROM rooms WHERE id = ?", [roomId]);
  }

  updateTheoryAnswer({
    roomId,
    questionIndex,
    user_answer,
    rating,
    comment,
    baseRevision,
  }: {
    roomId: string;
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

    const theoryAnswers = JSON.parse(room.theory_answers) as AnswerFieldsJson[];
    const currentRevision = this.getItemRevision(theoryAnswers[questionIndex]);
    this.assertRevisionMatch(currentRevision, baseRevision);

    const nextRevision = currentRevision + 1;
    theoryAnswers[questionIndex] = {
      user_answer,
      rating,
      comment,
      revision: nextRevision,
    };

    this.run("UPDATE rooms SET theory_answers = ?, updated_at = datetime('now') WHERE id = ?", [
      JSON.stringify(theoryAnswers),
      roomId,
    ]);

    return nextRevision;
  }

  updatePracticeAnswer({
    roomId,
    questionIndex,
    user_answer,
    rating,
    comment,
    baseRevision,
  }: {
    roomId: string;
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

    const practiceAnswers = JSON.parse(room.practice_answers) as AnswerFieldsJson[];
    const currentRevision = this.getItemRevision(practiceAnswers[questionIndex]);
    this.assertRevisionMatch(currentRevision, baseRevision);

    const nextRevision = currentRevision + 1;
    practiceAnswers[questionIndex] = {
      user_answer,
      rating,
      comment,
      revision: nextRevision,
    };

    this.run("UPDATE rooms SET practice_answers = ?, updated_at = datetime('now') WHERE id = ?", [
      JSON.stringify(practiceAnswers),
      roomId,
    ]);

    return nextRevision;
  }

  private getItemRevision(item: AnswerFieldsJson | undefined): number {
    return item?.revision ?? 0;
  }

  private assertRevisionMatch(currentRevision: number, baseRevision: number): void {
    if (currentRevision !== baseRevision) {
      throw new ConflictError("Question was updated by someone else.");
    }
  }

  private createRoomsTable(): void {
    this.run(ROOMS_TABLE_SCHEMA);
  }

  private isRoomIdTaken(id: string): boolean {
    return this.get("SELECT 1 FROM rooms WHERE id = ?", [id]) !== undefined;
  }
}
