import { describe, expect, it } from "vitest";
import { roomsWebSocketUrl } from "./roomsWebSocketUrl";

describe("roomsWebSocketUrl", () => {
  it("maps an http base to a ws url with the rooms path", () => {
    expect(roomsWebSocketUrl("http://example.com/api", "ROOM1")).toBe(
      "ws://example.com/api/ws/rooms/ROOM1",
    );
  });

  it("maps an https base to a wss url", () => {
    expect(roomsWebSocketUrl("https://example.com/api", "ROOM1")).toBe(
      "wss://example.com/api/ws/rooms/ROOM1",
    );
  });

  it("strips a trailing slash from the base path", () => {
    expect(roomsWebSocketUrl("http://example.com/api/", "ROOM1")).toBe(
      "ws://example.com/api/ws/rooms/ROOM1",
    );
  });

  it("drops query string and hash from the base", () => {
    expect(roomsWebSocketUrl("http://example.com/api?token=abc#frag", "ROOM1")).toBe(
      "ws://example.com/api/ws/rooms/ROOM1",
    );
  });

  it("uses window.location for a relative base", () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    expect(roomsWebSocketUrl("/api", "ROOM1")).toBe(
      `${protocol}//${window.location.host}/api/ws/rooms/ROOM1`,
    );
  });

  it("strips a trailing slash from a relative base", () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    expect(roomsWebSocketUrl("/api/", "ROOM1")).toBe(
      `${protocol}//${window.location.host}/api/ws/rooms/ROOM1`,
    );
  });

  it("encodes the room id as one path segment", () => {
    expect(roomsWebSocketUrl("https://example.com/api", "room / one")).toBe(
      "wss://example.com/api/ws/rooms/room%20%2F%20one",
    );
  });
});
