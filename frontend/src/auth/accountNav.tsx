import { Link, useLocation } from "react-router-dom";
import { useAuth } from "./context";
import { signInPath } from "./client";
import { roomIdFromSearch } from "../routes/paths";
import RoomIndicator from "./roomIndicator";

export default function AccountNav({ showRoom = true }: { showRoom?: boolean }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}`;
  const profilePath = roomIdFromSearch(location.search)
    ? `/profile?returnTo=${encodeURIComponent(currentPath)}`
    : "/profile";
  return <nav className="account-nav" aria-label="Account">
    {showRoom && <RoomIndicator />}
    {loading ? <span>Loading account…</span> : profile
      ? <Link className="account-profile-link" to={profilePath} aria-label="Profile" title="Profile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.25" />
            <path d="M5.75 19c.55-3.15 2.65-5 6.25-5s5.7 1.85 6.25 5" />
          </svg>
        </Link>
      : <Link to={signInPath(currentPath)}>Sign in</Link>}
  </nav>;
}
