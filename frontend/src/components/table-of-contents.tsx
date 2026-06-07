import type { ChapterMeta } from "@study-platform/shared";

type TableOfContentsProps = {
  chapters: ChapterMeta[];
  selectedChapterId: string;
  onSelectChapter: (chapterId: string) => void;
};

function TableOfContents({ chapters, selectedChapterId, onSelectChapter }: TableOfContentsProps) {
  return (
    <aside className="sidebar">
      <h2>Table of contents</h2>
      <div className="chapter-list">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            type="button"
            className={`chapter-button ${chapter.id === selectedChapterId ? "active" : ""}`}
            onClick={() => onSelectChapter(chapter.id)}
          >
            {chapter.number}. {chapter.name}
          </button>
        ))}
      </div>
    </aside>
  );
}

export default TableOfContents;
