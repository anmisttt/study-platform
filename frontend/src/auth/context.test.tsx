import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./context";
import { ApiRequestError, request } from "./client";

const profile = { id: "user-a", email: "a@example.com", llmKey: { configured: false, lastFour: null, updatedAt: null } };
function response(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status }); }
function wrapper({ children }: { children: ReactNode }) {
  return <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode>;
}
async function focus() { await act(async () => { window.dispatchEvent(new Event("focus")); }); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubGlobal("fetch", vi.fn(async () => response(profile)));
  vi.stubGlobal("BroadcastChannel", vi.fn());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([profile, null])("checks the initial profile (%j) once and does not refresh in the background", async cached => {
  vi.mocked(fetch).mockResolvedValueOnce(response(cached));
  const { result } = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.profile).toEqual(cached);
  expect(result.current.error).toBe("");
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith("/api/me", expect.objectContaining({ credentials: "include" }));

  await focus();
  vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
  await focus();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(BroadcastChannel).not.toHaveBeenCalled();
  expect(result.current.profile).toEqual(cached);
  expect(result.current.error).toBe("");
});

it("checks the current session again when the app is reloaded", async () => {
  const first = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(first.result.current.profile).toEqual(profile));
  first.unmount();
  vi.mocked(fetch).mockResolvedValueOnce(response(null));
  const { result } = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.current.profile).toBeNull();
  expect(result.current.error).toBe("");
});

it("does not automatically retry a failed initial auth check", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("Unable to load your account. Please try again.");
  await focus();
  expect(fetch).toHaveBeenCalledOnce();
  expect(result.current.profile).toBeNull();
});

it("clears the account when a protected action returns 401 without another auth check", async () => {
  const { result } = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.profile).toEqual(profile));
  vi.mocked(fetch).mockResolvedValueOnce(response({ error: "Please sign in to continue.", code: "AUTH_REQUIRED" }, 401));
  await act(async () => {
    await expect(request("/rooms", { method: "POST", body: JSON.stringify({ chapterId: "chapter" }) })).rejects.toBeInstanceOf(ApiRequestError);
  });
  expect(result.current.profile).toBeNull();
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe("");
  await focus();
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(["/api/me", "/api/rooms"]);
});

it("keeps a pending initial auth check from restoring the profile after sign-out", async () => {
  let complete!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const { result } = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const initialSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  await focus();
  vi.mocked(fetch).mockResolvedValueOnce(response({ success: true }));
  await act(async () => { await result.current.signOut(); });
  expect(initialSignal?.aborted).toBe(true);
  await act(async () => { complete(response(profile)); });
  await focus();
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(["/api/me", "/api/auth/sign-out"]);
  expect(BroadcastChannel).not.toHaveBeenCalled();
  expect(result.current.profile).toBeNull();
  expect(result.current.error).toBe("");
});

it("updates key status from an action response without fetching the profile again", async () => {
  const { result } = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(result.current.profile).toEqual(profile));
  const llmKey = { configured: true, lastFour: "1234", updatedAt: "2026-10-11T00:00:00Z" };
  await act(async () => { result.current.updateKeyStatus(llmKey); });
  expect(result.current.profile).toEqual({ ...profile, llmKey });
  expect(fetch).toHaveBeenCalledOnce();
  vi.mocked(fetch).mockResolvedValueOnce(response({ success: true }));
  await act(async () => { await result.current.signOut(); });
  await act(async () => { result.current.updateKeyStatus(llmKey); });
  expect(result.current.profile).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
