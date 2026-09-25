import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuth } from "../auth/context";
import { useRoomParticipation } from "./useRoomParticipation";

vi.mock("../auth/context", () => ({ useAuth: vi.fn() }));
let auth: ReturnType<typeof useAuth>;
const profile = { id: "user-a", email: "a@example.com", llmKey: { configured: false, lastFour: null, updatedAt: null } };
function response(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status }); }
function registrations() { return vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/participants/me")); }

beforeEach(() => {
  auth = { profile, loading: false, error: "", refresh: vi.fn(async () => {}), signOut: vi.fn(async () => {}) };
  vi.mocked(useAuth).mockImplementation(() => auth);
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/me") && !String(url).includes("/participants/")
    ? response(auth.profile) : response({ participationCreated: false })));
});
afterEach(() => { vi.unstubAllGlobals(); });

it("waits for sign-in and registers once per room entry, including StrictMode", async () => {
  auth.profile = null;
  const { result, rerender } = renderHook(({ roomId }) => useRoomParticipation(roomId), {
    initialProps: { roomId: "room-a" as string | null }, wrapper: StrictMode,
  });
  expect(fetch).not.toHaveBeenCalled();
  auth.profile = profile;
  rerender({ roomId: "room-a" });
  await waitFor(() => expect(registrations()).toHaveLength(1));
  await waitFor(() => expect(result.current.status).toBe("idle"));
  expect(registrations()[0]).toEqual(["/api/rooms/room-a/participants/me", expect.objectContaining({ method: "POST", credentials: "include" })]);
  expect(registrations()[0][1]?.body).toBeUndefined();
  auth.profile = { ...profile };
  rerender({ roomId: "room-a" });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(registrations()).toHaveLength(1);
  rerender({ roomId: null });
  rerender({ roomId: "room-a" });
  await waitFor(() => expect(registrations()).toHaveLength(2));
});

it("does not register while the account is loading or unavailable", async () => {
  auth.loading = true;
  const { rerender } = renderHook(() => useRoomParticipation("room-a"));
  expect(fetch).not.toHaveBeenCalled();
  auth.loading = false; auth.error = "Account unavailable";
  rerender();
  expect(fetch).not.toHaveBeenCalled();
  auth.error = "";
  rerender();
  await waitFor(() => expect(registrations()).toHaveLength(1));
});

it.each(["manual", "focus", "online"])("retries a failed registration through %s after confirming the account", async trigger => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ error: "Busy", code: "DATABASE_BUSY" }, 503))
    .mockResolvedValueOnce(response(profile)).mockResolvedValueOnce(response({ participationCreated: true }));
  const { result } = renderHook(() => useRoomParticipation("room-a"));
  await waitFor(() => expect(result.current.status).toBe("error"));
  await act(async () => {
    if (trigger === "manual") result.current.retry();
    else window.dispatchEvent(new Event(trigger));
  });
  await waitFor(() => expect(result.current.status).toBe("saved"));
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
    "/api/rooms/room-a/participants/me", "/api/me", "/api/rooms/room-a/participants/me",
  ]);
  await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
  expect(registrations()).toHaveLength(2);
});

it("does not replay one account's failed request under a different session", async () => {
  const nextProfile = { ...profile, id: "user-b" };
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(response(nextProfile));
  const { result, rerender } = renderHook(() => useRoomParticipation("room-a"));
  await waitFor(() => expect(result.current.status).toBe("error"));
  await act(async () => { result.current.retry(); });
  expect(auth.refresh).toHaveBeenCalledOnce();
  expect(registrations()).toHaveLength(1);
  auth.profile = nextProfile;
  rerender();
  await waitFor(() => expect(registrations()).toHaveLength(2));
});

it("aborts stale work on room/account changes and ignores its success", async () => {
  let complete!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const { result, rerender } = renderHook(({ roomId }) => useRoomParticipation(roomId), { initialProps: { roomId: "room-a" } });
  await waitFor(() => expect(registrations()).toHaveLength(1));
  const oldSignal = registrations()[0][1]?.signal;
  auth.profile = { ...profile, id: "user-b" };
  rerender({ roomId: "room-b" });
  expect(oldSignal?.aborted).toBe(true);
  await waitFor(() => expect(result.current.status).toBe("idle"));
  await act(async () => { complete(response({ participationCreated: true })); });
  expect(result.current.status).toBe("idle");
  expect(registrations()[1][0]).toBe("/api/rooms/room-b/participants/me");
});

it("cancels pending work on sign-out without expiring the next session", async () => {
  let complete!: (value: Response) => void;
  const expired = vi.fn();
  window.addEventListener("session-expired", expired);
  try {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const { result, rerender } = renderHook(() => useRoomParticipation("room-a"));
    await waitFor(() => expect(registrations()).toHaveLength(1));
    auth.profile = null;
    rerender();
    await act(async () => { complete(response({ error: "Expired", code: "AUTH_REQUIRED" }, 401)); });
    expect(result.current.status).toBe("idle");
    expect(expired).not.toHaveBeenCalled();
  } finally { window.removeEventListener("session-expired", expired); }
});
