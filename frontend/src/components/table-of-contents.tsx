import { useLocation, useNavigate } from "react-router-dom";
import type { ChapterMeta } from "@study-platform/shared";
import { chapterOverviewPath, chaptersPath } from "../routes/paths";

type TableOfContentsProps = {
  chapters: ChapterMeta[];
  activeChapterId: string;
};

function TableOfContents({ chapters, activeChapterId }: TableOfContentsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === chaptersPath();

  return (
    <aside className="sidebar">
      {!isHome && (
        <button
          type="button"
          className="sidebar-home-link"
          onClick={() => {
            navigate(chaptersPath());
          }}
        >
          ← Home
        </button>
      )}
      <h2>Table of contents</h2>
      <div className="chapter-list">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            type="button"
            className={`chapter-button ${chapter.id === activeChapterId ? "active" : ""}`}
            onClick={() => {
              navigate(chapterOverviewPath(chapter.id));
            }}
          >
            {chapter.number}. {chapter.name}
          </button>
        ))}
      </div>
    </aside>
  );
}

export default TableOfContents;
