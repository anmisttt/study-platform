import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ChapterMeta } from "@study-platform/shared";
import AccountNav from "../auth/accountNav";
import { chapterEntryPath, chaptersPath } from "../routes/paths";
import { useCurrentRoom } from "../hooks/useCurrentRoom";
import { SIDEBAR_HEADER_QUERY, useMediaQuery } from "../hooks/useMediaQuery";

type TableOfContentsProps = {
  chapters: ChapterMeta[];
  activeChapterId: string;
};

function TableOfContents({ chapters, activeChapterId }: TableOfContentsProps) {
  const { linkRoomId } = useCurrentRoom();
  const inSidebarHeader = useMediaQuery(SIDEBAR_HEADER_QUERY);
  const location = useLocation();
  const isHome = location.pathname === chaptersPath();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-header">
        {isHome ? (
          <span className="sidebar-header-title">Table of contents</span>
        ) : (
          <Link
            to={chaptersPath(linkRoomId)}
            className="sidebar-home-link sidebar-header-home"
            onClick={() => {
              setIsOpen(false);
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
          </Link>
        )}
        <AccountNav showRoom={inSidebarHeader} />
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
            <Link to={chaptersPath(linkRoomId)} className="sidebar-home-link sidebar-body-home">
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
            </Link>
          )}
          <h2 className="sidebar-title">Table of contents</h2>
          <div className="chapter-list">
            {chapters.map((chapter) => (
              <Link
                key={chapter.id}
                to={chapterEntryPath(chapter, linkRoomId)}
                className={`chapter-button ${chapter.id === activeChapterId ? "active" : ""}`}
                onClick={() => {
                  setIsOpen(false);
                }}
              >
                {chapter.number}. {chapter.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default TableOfContents;
