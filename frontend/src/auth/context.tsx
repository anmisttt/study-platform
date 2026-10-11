import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LlmKeyStatus, UserProfile } from "@study-platform/shared";
import { authRequest, request } from "./client";

type AuthState = {
  profile: UserProfile | null; loading: boolean; error: string;
  updateKeyStatus: (llmKey: LlmKeyStatus) => void;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState>({ profile: null, loading: false, error: "", updateKeyStatus: () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    // Check once per page load; defer to avoid duplicate requests in StrictMode.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      try {
        const user = await request<UserProfile | null>("/me", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setProfile(user);
      } catch {
        if (!controller.signal.aborted) setError("Unable to load your account. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    // Protected actions report expiry through their own backend responses.
    const expired = () => {
      controller.abort();
      setProfile(null); setError(""); setLoading(false);
    };
    window.addEventListener("session-expired", expired);
    return () => { controller.abort(); window.removeEventListener("session-expired", expired); };
  }, []);
  const updateKeyStatus = (llmKey: LlmKeyStatus) => {
    setProfile(current => current ? { ...current, llmKey } : null);
  };
  const signOut = async () => {
    await authRequest("/sign-out", {});
    window.dispatchEvent(new Event("session-expired"));
  };
  return <AuthContext.Provider value={{ profile, loading, error, updateKeyStatus, signOut }}>{children}</AuthContext.Provider>;
}
// The hook and provider share their private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext); }
