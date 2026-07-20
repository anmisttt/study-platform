import { describe, expect, it } from "vitest";
import { draftWebSocketUrl } from "./draftWebSocketUrl";

describe("draftWebSocketUrl", () => {
  it("maps an http base to a ws url with the drafts path", () => {
    expect(draftWebSocketUrl("http://example.com/api")).toBe("ws://example.com/api/drafts/ws");
  });

  it("maps an https base to a wss url", () => {
    expect(draftWebSocketUrl("https://example.com/api")).toBe("wss://example.com/api/drafts/ws");
  });

  it("strips a trailing slash from the base path", () => {
    expect(draftWebSocketUrl("http://example.com/api/")).toBe("ws://example.com/api/drafts/ws");
  });

  it("drops query string and hash from the base", () => {
    expect(draftWebSocketUrl("http://example.com/api?token=abc#frag")).toBe(
      "ws://example.com/api/drafts/ws",
    );
  });

  it("uses window.location for a relative base", () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    expect(draftWebSocketUrl("/api")).toBe(`${protocol}//${window.location.host}/api/drafts/ws`);
  });

  it("strips a trailing slash from a relative base", () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    expect(draftWebSocketUrl("/api/")).toBe(`${protocol}//${window.location.host}/api/drafts/ws`);
  });
});
