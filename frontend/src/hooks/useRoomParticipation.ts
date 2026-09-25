import { useEffect, useRef, useState } from "react";
import type { RoomParticipationResult, UserProfile } from "@study-platform/shared";
import { request } from "../auth/client";
import { useAuth } from "../auth/context";

type ParticipationState = {
  userId: string;
  roomId: string;
  status: "pending" | "saved" | "error" | "idle";
};

export function useRoomParticipation(roomId: string | null) {
  const { profile, loading, error, refresh } = useAuth();
  const userId = !loading && !error ? profile?.id ?? null : null;
  const [state, setState] = useState<ParticipationState | null>(null);
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!roomId || !userId) return;
    const activeUserId = userId;
    const activeRoomId = roomId;
    let active = true;
    let inFlight = false;
    let saved = false;
    let failed = false;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function register(verifySession = false) {
      if (!active || inFlight || saved) return;
      inFlight = true;
      failed = false;
      setState({ userId: activeUserId, roomId: activeRoomId, status: "pending" });
      try {
        // A tab may have changed accounts while this request was waiting to be
        // retried. Confirm its session before replaying a failed registration.
        if (verifySession) {
          const current = await request<UserProfile>("/me", { signal: controller.signal });
          if (!active) return;
          if (current.id !== userId) { await refresh(); return; }
        }
        if (!active) return;
        const result = await request<RoomParticipationResult>(`/rooms/${encodeURIComponent(activeRoomId)}/participants/me`, {
          method: "POST", signal: controller.signal,
        });
        if (!active) return;
        saved = true;
        setState({ userId: activeUserId, roomId: activeRoomId, status: result.participationCreated ? "saved" : "idle" });
        if (result.participationCreated) {
          noticeTimer = setTimeout(() => {
            if (active) setState({ userId: activeUserId, roomId: activeRoomId, status: "idle" });
          }, 6000);
        }
      } catch {
        if (!active) return;
        failed = true;
        setState({ userId: activeUserId, roomId: activeRoomId, status: "error" });
      } finally { inFlight = false; }
    }

    const retry = () => { if (failed) void register(true); };
    retryRef.current = retry;
    // Deferring also avoids duplicate requests in StrictMode's setup/cleanup cycle.
    void Promise.resolve().then(() => register());
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(noticeTimer);
      retryRef.current = () => {};
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
    };
  }, [roomId, userId, refresh]);

  const status = state?.roomId === roomId && state.userId === userId ? state.status : "idle";
  return { status, retry: () => retryRef.current() };
}
