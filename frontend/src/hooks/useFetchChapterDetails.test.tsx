import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomDetails } from "@study-platform/shared";
import { useFetchChapterDetails } from "./useFetchChapterDetails";
import { createInitialChapterSession } from "../components/contest-types";
import { mergeRoomDetailsIntoSession } from "../utils/room";
import { API_BASE, roomDetails } from "../test/fixtures";

vi.mock("../utils/room", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/room")>();
  return { ...actual, mergeRoomDetailsIntoSession: vi.fn(actual.mergeRoomDetailsIntoSession) };
});

const publicDetails: RoomDetails = { ...roomDetails, roomId: null, hasOwnerLlmKey: false };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useFetchChapterDetails", () => {
  beforeEach(() => {
    vi.mocked(mergeRoomDetailsIntoSession).mockClear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(publicDetails))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads public chapter details through mergeRoomDetailsIntoSession", async () => {
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "first_chapter", true));

    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/chapters/first_chapter`, expect.anything());
    expect(mergeRoomDetailsIntoSession).toHaveBeenCalledWith(createInitialChapterSession(), publicDetails);
    expect(result.current.session?.details?.theory[0]?.answer).toBe("An instance of a running program.");
    expect(result.current.session?.hasOwnerLlmKey).toBe(false);
    expect(result.current.error).toBe("");
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "first_chapter", false));

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ session: null, error: "" });
  });

  it("reports load errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Chapter not found." }, 404));
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "missing", true));

    await waitFor(() => expect(result.current.error).toBe("Chapter not found."));
    expect(result.current.session).toBeNull();
  });

  it("shows a readable error for a non-JSON failure page", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "first_chapter", true));

    await waitFor(() => expect(result.current.error).toBe("Failed to load chapter."));
  });

  it("refetches after retry", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "first_chapter", true));

    await waitFor(() => expect(result.current.error).toBe("Failed to load chapter."));
    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(result.current.error).toBe("");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale response after the chapter changes", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ ...publicDetails, chapterId: "second", name: "Second" })));

    const { result, rerender } = renderHook(
      ({ chapterId }) => useFetchChapterDetails(API_BASE, chapterId, true),
      { initialProps: { chapterId: "first_chapter" } },
    );
    rerender({ chapterId: "second" });

    await waitFor(() => expect(result.current.session?.details?.name).toBe("Second"));
    resolveFirst(jsonResponse(publicDetails));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.session?.details?.name).toBe("Second");
  });
});
