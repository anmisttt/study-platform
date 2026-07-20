import { describe, expect, it } from "vitest";
import {
  activeChapterIdFromPath,
  chapterOverviewPath,
  chapterQuestionPath,
  chaptersPath,
  roomIdFromSearch,
} from "./paths";

describe("routes/paths", () => {
  it("builds chapter paths and preserves roomId in the query string", () => {
    expect(chaptersPath()).toBe("/chapters");
    expect(chapterOverviewPath("first_chapter")).toBe("/chapters/first_chapter/overview");
    expect(chapterOverviewPath("first_chapter", "ABC123")).toBe(
      "/chapters/first_chapter/overview?roomId=ABC123",
    );
    expect(chapterQuestionPath("first_chapter", "theory-0")).toBe(
      "/chapters/first_chapter/questions/theory-0",
    );
    expect(chapterQuestionPath("first_chapter", "practice-0", "ABC123")).toBe(
      "/chapters/first_chapter/questions/practice-0?roomId=ABC123",
    );
  });

  it("encodes room ids in query params", () => {
    expect(chapterQuestionPath("ch", "theory-0", "A B")).toBe(
      "/chapters/ch/questions/theory-0?roomId=A%20B",
    );
  });

  it("extracts the active chapter id from the pathname", () => {
    expect(activeChapterIdFromPath("/chapters")).toBe("");
    expect(activeChapterIdFromPath("/chapters/first_chapter/overview")).toBe("first_chapter");
    expect(activeChapterIdFromPath("/chapters/first_chapter/questions/theory-0")).toBe(
      "first_chapter",
    );
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
