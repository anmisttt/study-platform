import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFetchChapterDetails } from "./useFetchChapterDetails";
import { API_BASE, chapter } from "../test/fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useFetchChapterDetails", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(chapter))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the chapter without writing it to browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const openDb = vi.spyOn(indexedDB, "open");
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "first_chapter", true));

    await waitFor(() => expect(result.current.chapter).not.toBeNull());
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/chapters/first_chapter`, expect.anything());
    expect(result.current.chapter).toEqual(chapter);
    expect(result.current.error).toBe("");
    expect(setItem).not.toHaveBeenCalled();
    expect(openDb).not.toHaveBeenCalled();
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "first_chapter", false));

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ chapter: null, error: "" });
  });

  it("reports load errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Chapter not found." }, 404));
    const { result } = renderHook(() => useFetchChapterDetails(API_BASE, "missing", true));

    await waitFor(() => expect(result.current.error).toBe("Chapter not found."));
    expect(result.current.chapter).toBeNull();
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

    await waitFor(() => expect(result.current.chapter).not.toBeNull());
    expect(result.current.error).toBe("");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale response after the chapter changes", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ ...chapter, id: "second", name: "Second" })));

    const { result, rerender } = renderHook(
      ({ chapterId }) => useFetchChapterDetails(API_BASE, chapterId, true),
      { initialProps: { chapterId: "first_chapter" } },
    );
    rerender({ chapterId: "second" });

    await waitFor(() => expect(result.current.chapter?.name).toBe("Second"));
    resolveFirst(jsonResponse(chapter));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.chapter?.name).toBe("Second");
  });
});
