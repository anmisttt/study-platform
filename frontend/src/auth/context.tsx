import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UserProfile } from "@study-platform/shared";
import { ApiRequestError, authRequest, request } from "./client";

type AuthState = {
  profile: UserProfile | null; loading: boolean; error: string;
  refresh: () => Promise<void>; signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState>({ profile: null, loading: false, error: "", refresh: async () => {}, signOut: async () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const user = await request<UserProfile>("/me");
      if (current === generation.current) { setProfile(user); setError(""); }
    } catch (error) {
      if (current === generation.current) {
        setProfile(null);
        setError(error instanceof ApiRequestError && error.status === 401 ? "" : "Unable to load your account. Please try again.");
      }
    } finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) return refresh(); });
    const expired = () => { generation.current++; setProfile(null); setLoading(false); };
    const focus = () => { void refresh(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("study-account") : null;
    if (channel) channel.onmessage = focus;
    window.addEventListener("focus", focus);
    window.addEventListener("session-expired", expired);
    return () => { mounted = false; channel?.close(); window.removeEventListener("focus", focus); window.removeEventListener("session-expired", expired); };
  }, [refresh]);
  const signOut = async () => {
    await authRequest("/sign-out", {});
    generation.current++;
    setProfile(null);
    if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("study-account"); channel.postMessage("logout"); channel.close(); }
  };
  return <AuthContext.Provider value={{ profile, loading, error, refresh, signOut }}>{children}</AuthContext.Provider>;
}
// The hook and provider share their private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext); }
