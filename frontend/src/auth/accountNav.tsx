import { Link, useLocation } from "react-router-dom";
import { useAuth } from "./context";
import { signInPath } from "./client";

export default function AccountNav() {
  const { profile, loading } = useAuth();
  const location = useLocation();
  return <nav className="account-nav" aria-label="Account">
    {loading ? <span>Loading account…</span> : profile
      ? <Link className="account-profile-link" to="/profile" aria-label="Profile" title="Profile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.25" />
            <path d="M5.75 19c.55-3.15 2.65-5 6.25-5s5.7 1.85 6.25 5" />
          </svg>
        </Link>
      : <Link to={signInPath(`${location.pathname}${location.search}`)}>Sign in</Link>}
  </nav>;
}
