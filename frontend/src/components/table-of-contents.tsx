import { useState } from "react";
import { Link } from "react-router-dom";
import type { ChapterMeta } from "@study-platform/shared";
import AccountNav from "../auth/accountNav";
import { chapterEntryPath, chaptersPath } from "../routes/paths";
import { useCurrentRoom } from "../hooks/useCurrentRoom";
import { SIDEBAR_HEADER_QUERY, useMediaQuery } from "../hooks/useMediaQuery";

const COLLAPSED_KEY = "study-platform.sidebarCollapsed";

// Storage can be unavailable (private windows, blocked site data); the sidebar then starts expanded.
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch (error: unknown) {
    console.error("Couldn't read the sidebar state.", error);
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch (error: unknown) {
    console.error("Couldn't save the sidebar state; it is kept for this tab only.", error);
  }
}

type TableOfContentsProps = {
  chapters: ChapterMeta[];
  activeChapterId: string;
};

function TableOfContents({ chapters, activeChapterId }: TableOfContentsProps) {
  const { linkRoomId } = useCurrentRoom();
  const inSidebarHeader = useMediaQuery(SIDEBAR_HEADER_QUERY);
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const railed = collapsed && !inSidebarHeader;

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""} ${railed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <Link to={chaptersPath(linkRoomId)} className="sidebar-home" aria-label="Home: all chapters" title="Home" onClick={() => setIsOpen(false)}>
          <span className="sidebar-home-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
            </svg>
          </span>
          <span className="sidebar-home-name">Study Platform</span>
        </Link>
        {inSidebarHeader && <AccountNav />}
        {inSidebarHeader ? (
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
        ) : (
          <button
            type="button"
            className="sidebar-collapse"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => {
              setCollapsed(!collapsed);
              writeCollapsed(!collapsed);
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
              <polyline points={collapsed ? "13 10 15 12 13 14" : "15 10 13 12 15 14"} />
            </svg>
          </button>
        )}
      </div>

      {railed ? (
        <div className="sidebar-rail">
          <div className="sidebar-rail-divider" />
          {chapters.map((chapter) => (
            <Link
              key={chapter.id}
              to={chapterEntryPath(chapter, linkRoomId)}
              className={`sidebar-rail-chapter ${chapter.id === activeChapterId ? "active" : ""}`}
              aria-label={`${chapter.number}. ${chapter.name}`}
              title={`${chapter.number}. ${chapter.name}`}
            >
              {chapter.number}
            </Link>
          ))}
        </div>
      ) : (
        <div className="sidebar-body" id="sidebar-body">
          <div className="sidebar-body-inner">
            <h2 className="sidebar-title">Table of contents</h2>
            <div className="chapter-list">
              {chapters.map((chapter) => (
                <Link
                  key={chapter.id}
                  to={chapterEntryPath(chapter, linkRoomId)}
                  className={`chapter-button ${chapter.id === activeChapterId ? "active" : ""}`}
                  title={`${chapter.number}. ${chapter.name}`}
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
      )}
    </aside>
  );
}

export default TableOfContents;
