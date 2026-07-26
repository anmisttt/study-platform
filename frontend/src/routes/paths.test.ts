import { describe, expect, it } from "vitest";
import type { ChapterMeta } from "@study-platform/shared";
import {
  canonicalChapterPath,
  chapterKeyFromPath,
  chapterOverviewPath,
  chapterQuestionPath,
  chaptersPath,
  resolveChapterMeta,
  roomIdFromSearch,
} from "./paths";

const chapterMeta: ChapterMeta = {
  id: "first_chapter",
  number: 1,
  name: "Introduction",
  theoryCount: 1,
  practiceCount: 1,
};

const chaptersById = new Map([[chapterMeta.id, chapterMeta]]);

describe("routes/paths", () => {
  it("builds chapter paths from chapter number and preserves roomId", () => {
    expect(chaptersPath()).toBe("/chapters");
    expect(chapterOverviewPath(1)).toBe("/chapters/1/overview");
    expect(chapterOverviewPath(1, "ABC123")).toBe("/chapters/1/overview?roomId=ABC123");
    expect(chapterQuestionPath(1, "theory-0")).toBe("/chapters/1/questions/theory-0");
    expect(chapterQuestionPath(11, "practice-0", "ABC123")).toBe(
      "/chapters/11/questions/practice-0?roomId=ABC123",
    );
  });

  it("encodes room ids in query params", () => {
    expect(chapterQuestionPath(1, "theory-0", "A B")).toBe(
      "/chapters/1/questions/theory-0?roomId=A%20B",
    );
  });

  it("extracts the chapter key from the pathname", () => {
    expect(chapterKeyFromPath("/chapters")).toBe("");
    expect(chapterKeyFromPath("/chapters/1/overview")).toBe("1");
    expect(chapterKeyFromPath("/chapters/first_chapter/questions/theory-0")).toBe("first_chapter");
  });

  it("resolves chapters by number or legacy id", () => {
    expect(resolveChapterMeta("1", chaptersById)).toEqual(chapterMeta);
    expect(resolveChapterMeta("first_chapter", chaptersById)).toEqual(chapterMeta);
    expect(resolveChapterMeta("99", chaptersById)).toBeNull();
    expect(resolveChapterMeta("missing", chaptersById)).toBeNull();
  });

  it("canonicalizes legacy id paths to chapter numbers", () => {
    expect(canonicalChapterPath("/chapters/first_chapter/overview", chapterMeta)).toBe(
      "/chapters/1/overview",
    );
    expect(
      canonicalChapterPath("/chapters/first_chapter/questions/theory-0", chapterMeta),
    ).toBe("/chapters/1/questions/theory-0");
    expect(canonicalChapterPath("/chapters/1/overview", chapterMeta)).toBeNull();
  });

  it("parses roomId from the search string", () => {
    expect(roomIdFromSearch("")).toBeNull();
    expect(roomIdFromSearch("roomId=")).toBeNull();
    expect(roomIdFromSearch("roomId=%20")).toBeNull();
    expect(roomIdFromSearch("roomId=ABC123")).toBe("ABC123");
    expect(roomIdFromSearch("?roomId=ABC123&x=1")).toBe("ABC123");
    expect(roomIdFromSearch("foo=1&roomId=XYZ")).toBe("XYZ");
  });
});
