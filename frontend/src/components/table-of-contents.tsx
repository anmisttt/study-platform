import { useState } from "react";
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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-header">
        {isHome ? (
          <span className="sidebar-header-title">Table of contents</span>
        ) : (
          <button
            type="button"
            className="sidebar-home-link sidebar-header-home"
            onClick={() => {
              setIsOpen(false);
              navigate(chaptersPath());
            }}
          >
            <svg
              className="sidebar-home-chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Home
          </button>
        )}
        <button
          type="button"
          className="sidebar-toggle"
          aria-expanded={isOpen}
          aria-controls="sidebar-body"
          aria-label="Toggle table of contents"
          onClick={() => {
            setIsOpen((prev) => !prev);
          }}
        >
          <svg
            className="sidebar-toggle-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <div className="sidebar-body" id="sidebar-body">
        <div className="sidebar-body-inner">
          {!isHome && (
            <button
              type="button"
              className="sidebar-home-link sidebar-body-home"
              onClick={() => {
                navigate(chaptersPath());
              }}
            >
              <svg
                className="sidebar-home-chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Home
            </button>
          )}
          <h2 className="sidebar-title">Table of contents</h2>
          <div className="chapter-list">
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                className={`chapter-button ${chapter.id === activeChapterId ? "active" : ""}`}
                onClick={() => {
                  setIsOpen(false);
                  navigate(chapterOverviewPath(chapter.id));
                }}
              >
                {chapter.number}. {chapter.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default TableOfContents;
