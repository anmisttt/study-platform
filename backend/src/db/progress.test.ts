import { describe, expect, it } from "vitest";
import { RoomsDb } from "./roomsDb.js";
import { chapters } from "../chapters.js";
import { profileRoomSummary } from "./progress.js";

describe("derived progress", () => {
  it("handles empty and complete rooms without counting sparse answers twice", () => {
    const db = new RoomsDb(":memory:"); db.initializeSchema();
    try {
      db.run('INSERT INTO "user" (id, email, createdAt, updatedAt) VALUES (?, ?, 0, 0)', ["owner", "owner@example.com"]);
      const chapter = chapters[0]; db.addRoom({ roomId: "room", chapterId: chapter.id, ownerUserId: "owner" });
      expect(profileRoomSummary(db.listParticipatedRooms("owner")[0], "owner")?.progress).toMatchObject({ checked: 0, averageScore: null });
      const answer = { user_answer: "Checked", rating: 2, revision: 4 };
      db.run("UPDATE rooms SET theory_answers = ?, practice_answers = ? WHERE id = 'room'", [JSON.stringify(chapter.theory.map(() => answer)), JSON.stringify(chapter.practice.map(() => answer))]);
      const summary = profileRoomSummary(db.listParticipatedRooms("owner")[0], "owner");
      expect(summary?.progress.checked).toBe(chapter.theory.length + chapter.practice.length);
      expect(summary?.progress.averageScore).toBe(2);
      expect(summary?.continueQuestionRef).toBe("theory-1");
    } finally { db.close(); }
  });
});
