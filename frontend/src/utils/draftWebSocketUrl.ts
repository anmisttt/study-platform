import { roomDraftsWebSocketPath } from "@study-platform/shared";

export function draftWebSocketUrl(apiBase: string): string {
  const wsPath = roomDraftsWebSocketPath();

  if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}${wsPath}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = apiBase.replace(/\/$/, "");
  return `${protocol}//${window.location.host}${base}${wsPath}`;
}
