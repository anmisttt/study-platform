import fs from "fs";
import path from "path";
import type { Chapter, RawChapter } from "@study-platform/shared";

const dataDir = path.join(__dirname, "data");

export const chapters: Chapter[] = fs
  .readdirSync(dataDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .flatMap((fileName) => {
    const filePath = path.join(dataDir, fileName);
    const fileContent = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(fileContent) as RawChapter | RawChapter[];
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const fileBaseName = path.parse(fileName).name;

    return entries.map((chapter, index) => ({
      ...chapter,
      id: chapter.id ?? `${fileBaseName}${entries.length > 1 ? `-${index + 1}` : ""}`,
    }));
  })
  .sort((a, b) => a.number - b.number);

export function getChapterById(chapterId: string): Chapter | undefined {
  return chapters.find((chapter) => chapter.id === chapterId);
}
