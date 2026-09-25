import type { ApiErrorResponse } from "@study-platform/shared";

export const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const AUTH_BASE = import.meta.env.VITE_AUTH_URL ?? "/api/auth";
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
export async function request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const response = await fetch(`${auth ? AUTH_BASE : API_BASE}${path}`, {
    ...init, credentials: "include",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const payload = response.status === 204 ? null : await response.json();
  // An old account/route request must not expire a newer session after cancellation.
  init.signal?.throwIfAborted();
  if (!response.ok) {
    if (response.status === 401 && !auth) window.dispatchEvent(new Event("session-expired"));
    const error = payload as ApiErrorResponse & { message?: string };
    throw new ApiRequestError(error.error ?? error.message ?? "Request failed.", response.status, error.code);
  }
  return payload as T;
}
export function authRequest<T = unknown>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) }, true);
}
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/profile";
  const url = new URL(value, window.location.origin);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/profile";
}
export function signInPath(returnTo: string): string { return `/login?returnTo=${encodeURIComponent(returnTo)}`; }
