import { describe, expect, it } from "vitest";
import { RoomsDb } from "./roomsDb.js";
import { chapters } from "../chapters.js";
import { profileRoomSummary, roomChapterSummaries } from "./progress.js";

function setup() {
  const db = new RoomsDb(":memory:"); db.initializeSchema();
  db.run('INSERT INTO "user" (id, email, createdAt, updatedAt) VALUES (?, ?, 0, 0)', ["owner", "owner@example.com"]);
  db.addRoom({ roomId: "room", ownerUserId: "owner" });
  const insert = (chapterId: string, type: "theory" | "practice", index: number, rating: number | null) =>
    db.run(`INSERT INTO answers (room_id, chapter_id, question_type, question_index, user_answer, rating, revision)
      VALUES ('room', ?, ?, ?, 'A', ?, 1)`, [chapterId, type, index, rating]);
  const summary = () => profileRoomSummary(db.listParticipatedRooms("owner")[0], db.listParticipatedCheckedAnswers("owner"), "owner");
  return { db, insert, summary };
}

describe("derived progress", () => {
  it("continues an empty room at the first question of the first chapter", () => {
    const { db, summary } = setup();
    try {
      expect(summary()).toMatchObject({
        chapters: [], activeChapterId: null,
        roomProgress: { checked: 0, total: 0, averageScore: null },
        continue: { chapterNumber: chapters[0].number, questionRef: "theory-1" },
      });
    } finally { db.close(); }
  });

  it("counts a complete chapter once", () => {
    const { db, insert, summary } = setup();
    try {
      const chapter = chapters[0];
      chapter.theory.forEach((_, index) => insert(chapter.id, "theory", index, 2));
      chapter.practice.forEach((_, index) => insert(chapter.id, "practice", index, 2));
      const total = chapter.theory.length + chapter.practice.length;
      expect(summary().chapters[0].progress).toMatchObject({ checked: total, total, averageScore: 2 });
      expect(summary().roomProgress).toEqual({ checked: total, total, averageScore: 2 });
      expect(summary().activeChapterId).toBe(chapter.id);
      expect(summary().continue).toEqual({ chapterNumber: chapter.number, questionRef: "theory-1" });
    } finally { db.close(); }
  });

  it("orders chapters ascending and starts at the lowest-numbered chapter with unsolved tasks", () => {
    const { db, insert, summary } = setup();
    try {
      const [first, second, third] = chapters;
      insert(third.id, "theory", 0, 5);
      first.theory.forEach((_, index) => insert(first.id, "theory", index, 1));
      first.practice.forEach((_, index) => insert(first.id, "practice", index, 1));
      insert(second.id, "theory", 0, 3);
      insert(second.id, "theory", 2, 3);
      expect(summary().chapters.map((chapter) => chapter.number)).toEqual([first.number, second.number, third.number]);
      expect(summary().chapters.map((chapter) => chapter.nextQuestionRef)).toEqual(["theory-1", "theory-2", "theory-2"]);
      expect(summary().activeChapterId).toBe(second.id);
      expect(summary().continue).toEqual({ chapterNumber: second.number, questionRef: "theory-2" });
    } finally { db.close(); }
  });

  it("ignores unknown chapters, questions beyond the chapter, and answers without a rating", () => {
    const { db, insert, summary } = setup();
    try {
      const chapter = chapters[0];
      insert(chapter.id, "theory", 1, 4);
      insert(chapter.id, "theory", 0, null);
      insert(chapter.id, "theory", chapter.theory.length, 5);
      insert("missing-chapter", "theory", 0, 1);
      expect(summary().chapters).toMatchObject([{
        chapterId: chapter.id, number: chapter.number, name: chapter.name, checked: 1, total: chapter.theory.length + chapter.practice.length,
        progress: { checked: 1, theory: { checked: 1 }, averageScore: 4 },
      }]);
      expect(summary().continue).toEqual({ chapterNumber: chapter.number, questionRef: "theory-1" });
      expect(roomChapterSummaries(db.listCheckedAnswers("room"))).toEqual([expect.objectContaining({ chapterId: chapter.id, checked: 1 })]);
    } finally { db.close(); }
  });
});
