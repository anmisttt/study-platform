import { useEffect, useRef, useState } from "react";
import type { RoomParticipationResult } from "@study-platform/shared";
import { request } from "../auth/client";
import { useAuth } from "../auth/context";

type ParticipationState = {
  userId: string;
  roomId: string;
  status: "pending" | "saved" | "error" | "idle";
};

export function useRoomParticipation(roomId: string | null) {
  const { profile, loading, error } = useAuth();
  const userId = !loading && !error ? profile?.id ?? null : null;
  const [state, setState] = useState<ParticipationState | null>(null);
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!roomId || !userId) return;
    const participant = { userId, roomId };
    let status: ParticipationState["status"] = "idle";
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function register() {
      if (controller.signal.aborted || status === "pending" || status === "saved") return;
      status = "pending";
      setState({ ...participant, status });
      try {
        const result = await request<RoomParticipationResult>(`/rooms/${encodeURIComponent(participant.roomId)}/participants/me`, {
          method: "POST", signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        status = "saved";
        setState({ ...participant, status: result.participationCreated ? "saved" : "idle" });
        if (result.participationCreated) {
          noticeTimer = setTimeout(() => {
            setState({ ...participant, status: "idle" });
          }, 6000);
        }
      } catch {
        if (controller.signal.aborted) return;
        status = "error";
        setState({ ...participant, status });
      }
    }

    const retry = () => { if (status === "error") void register(); };
    retryRef.current = retry;
    // Deferring also avoids duplicate requests in StrictMode's setup/cleanup cycle.
    void Promise.resolve().then(() => register());
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      controller.abort();
      clearTimeout(noticeTimer);
      retryRef.current = () => {};
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
    };
  }, [roomId, userId]);

  const status = state?.roomId === roomId && state.userId === userId ? state.status : "idle";
  return { status, retry: () => retryRef.current() };
}
