import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { chapter, chapterMeta, roomAnswers } from "./test/fixtures";
import { chapterOverviewPath, chapterQuestionPath, chaptersPath } from "./routes/paths";

let webSocketCount = 0;


function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    webSocketCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/participants/me")) return Promise.resolve(jsonResponse({ participationCreated: false }));
        if (url.endsWith("/me")) return Promise.resolve(jsonResponse({ id: "owner", email: "test@example.com", llmKey: { configured: false, lastFour: null, updatedAt: null } }));
        if (url.endsWith(`/chapters/${chapterMeta.id}`)) return Promise.resolve(jsonResponse(chapter));
        if (url.endsWith("/chapters") || url.includes("/chapters")) {
          return Promise.resolve(jsonResponse([chapterMeta]));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );
    vi.stubGlobal("alert", vi.fn());

    class MockWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      private roomId: string | null = null;
      constructor(url: string | URL) {
        const roomSegment = new URL(String(url), window.location.href).pathname.split("/").pop();
        this.roomId = roomSegment ? decodeURIComponent(roomSegment) : null;
        webSocketCount += 1;
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));

          if (this.roomId === "MISSING") {
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({ type: "error", message: "Room not found." }),
              }),
            );
            this.readyState = MockWebSocket.CLOSED;
            this.onclose?.(new CloseEvent("close", { code: 1008 }));
            return;
          }

          if (this.roomId) {
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({
                  type: "room_summary",
                  summary: { roomId: this.roomId, hasOwnerLlmKey: true, chapters: [] },
                }),
              }),
            );
          }
        });
      }
      send(data: string) {
        const message = JSON.parse(data) as { type?: string; chapterId?: string; questionId?: string };
        if (message.type === "watch_chapter" && this.roomId && this.roomId !== "MISSING") {
          queueMicrotask(() => {
            this.onmessage?.(new MessageEvent("message", {
              data: JSON.stringify({ type: "room_snapshot", answers: { ...roomAnswers, roomId: this.roomId, chapterId: message.chapterId } }),
            }));
          });
        }
        if (
          message.type === "watch_question" &&
          this.roomId &&
          this.roomId !== "MISSING" &&
          message.questionId
        ) {
          queueMicrotask(() => {
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({
                  type: "snapshot",
                  chapterId: message.chapterId,
                  questionId: message.questionId,
                  update: "",
                }),
              }),
            );
          });
        }
      }
      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close"));
      }
    }

    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects / to /chapters and shows the index welcome", async () => {
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Study Platform" })).toBeTruthy();
    expect(screen.getByText(/for practicing software engineering concepts/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /1\. Introduction/ })).toBeTruthy();
  });

  it("opens a chapter overview from the home chapter list", async () => {
    renderApp(chaptersPath());

    fireEvent.click(await screen.findByRole("button", { name: /1\. Introduction/ }));

    expect(await screen.findByRole("heading", { name: "Introduction" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Create a room" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join room" })).toBeTruthy();
  });

  it("keeps the remembered room in links from the home chapter list and the / redirect", async () => {
    localStorage.setItem("study-platform.currentRoom", JSON.stringify({ roomId: "OLD111", lastPath: "/chapters/1/overview?roomId=OLD111" }));
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: /1\. Introduction/ }));

    expect(await screen.findByText("What is a process?")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Room OLD111" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Join room" })).toBeNull();
  });

  it("puts the remembered room in sidebar links from a roomless chapter page", async () => {
    localStorage.setItem("study-platform.currentRoom", JSON.stringify({ roomId: "OLD111", lastPath: "/chapters/1/overview?roomId=OLD111" }));
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-1"));
    expect(await screen.findByText("What is a process?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create a room" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "1. Introduction" }));

    expect(await screen.findByPlaceholderText("Type your answer in any language...")).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Room OLD111" }).length).toBeGreaterThan(0);
  });

  it("prefers the room in the URL over the remembered room in built links", async () => {
    localStorage.setItem("study-platform.currentRoom", JSON.stringify({ roomId: "OLD111", lastPath: "/chapters/1/overview?roomId=OLD111" }));
    renderApp(chaptersPath("NEW222"));

    fireEvent.click(await screen.findByRole("button", { name: /1\. Introduction/ }));

    expect(await screen.findByPlaceholderText("Type your answer in any language...")).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Room NEW222" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Room OLD111" })).toBeNull();
  });

  it("keeps roomId on question deep links and renders the practice shell", async () => {
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-1", "ABC123"));

    expect(await screen.findByText("Theory 1")).toBeTruthy();
    expect(screen.getByText("What is a process?")).toBeTruthy();

    expect(screen.getAllByRole("button", { name: "Room ABC123" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(await screen.findByText("Practice 1")).toBeTruthy();
    expect(webSocketCount).toBe(1);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/participants/me"))).toHaveLength(1));
  });

  it("registers overview links without opening a WebSocket or editing an answer", async () => {
    renderApp(chapterOverviewPath(chapterMeta.number, "ABC123"));
    await screen.findByRole("heading", { name: "Introduction" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/rooms/ABC123/participants/me", expect.objectContaining({ method: "POST", credentials: "include" })));
    expect(webSocketCount).toBe(0);
  });

  it.each(["overview", "question", "join"])("lets anonymous visitors open a shared room through %s without auth errors", async entry => {
    const defaultFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) => String(input) === "/api/me"
      ? Promise.resolve(jsonResponse(null)) : defaultFetch(input, init));
    renderApp(entry === "question"
      ? chapterQuestionPath(chapterMeta.number, "theory-1", "ABC123")
      : chapterOverviewPath(chapterMeta.number, entry === "overview" ? "ABC123" : undefined));

    await screen.findAllByRole("link", { name: "Sign in" });
    if (entry === "join") {
      fireEvent.change(screen.getByPlaceholderText("Room ID"), { target: { value: "ABC123" } });
      fireEvent.click(screen.getByRole("button", { name: "Join room" }));
    }
    if (entry !== "overview") {
      expect(await screen.findByText("What is a process?")).toBeVisible();
      expect(screen.getByPlaceholderText("Type your answer in any language...")).toBeEnabled();
    }
    fireEvent.focus(window);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url)).sort()).toEqual(
      entry === "overview" ? ["/api/chapters", "/api/me"] : ["/api/chapters", `/api/chapters/${chapterMeta.id}`, "/api/me"],
    );
  });

  it("renders roomless question links read-only without redirecting", async () => {
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-1"));

    expect(await screen.findByText("What is a process?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create a room" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Create a room to answer…")).toBeDisabled();
    expect(screen.queryByText("A room ID is required to practice.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Browse questions" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(await screen.findByText("Practice 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create a room" })).toBeTruthy();
    expect(webSocketCount).toBe(0);
    expect(fetch).toHaveBeenCalledWith(`/api/chapters/${chapterMeta.id}`, expect.anything());
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/participants/me"))).toBe(false);
  });

  it("switches chapters inside a room over the same room connection", async () => {
    const second = { id: "second_chapter", number: 2, name: "Storage", theoryCount: 1, practiceCount: 0 };
    const defaultFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/chapters")) return Promise.resolve(jsonResponse([chapterMeta, second]));
      if (url.endsWith(`/chapters/${second.id}`)) {
        return Promise.resolve(jsonResponse({ ...second, theory: [{ question: "What is a B-tree?", answer: "A balanced tree." }], practice: [] }));
      }
      return defaultFetch(input, init);
    });
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-1", "ABC123"));
    expect(await screen.findByText("What is a process?")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "2. Storage" }));

    expect(await screen.findByText("What is a B-tree?")).toBeVisible();
    expect(screen.getByPlaceholderText("Type your answer in any language...")).toBeEnabled();
    expect(screen.queryByText(/AI features need an OpenAI key/)).toBeNull();
    expect(webSocketCount).toBe(1);
  });

  it("keeps the remembered room when browsing from a roomless overview", async () => {
    localStorage.setItem("study-platform.currentRoom", JSON.stringify({ roomId: "OLD111", lastPath: "/chapters/1/overview?roomId=OLD111" }));
    renderApp(chapterOverviewPath(chapterMeta.number));

    fireEvent.click(await screen.findByRole("button", { name: "Browse questions" }));

    expect(await screen.findByPlaceholderText("Type your answer in any language...")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Create a room" })).toBeNull();
  });

  it("opens the first question roomless from Browse questions", async () => {
    renderApp(chapterOverviewPath(chapterMeta.number));

    fireEvent.click(await screen.findByRole("button", { name: "Browse questions" }));

    expect(await screen.findByText("Theory 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create a room" })).toBeTruthy();
  });

  it("redirects unknown roomless question refs back to the chapter overview", async () => {
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-99"));

    expect(await screen.findByRole("button", { name: "Browse questions" })).toBeTruthy();
    expect(screen.queryByText("Theory 1")).toBeNull();
  });

  it("creates a room from a roomless question and stays on that question", async () => {
    const defaultFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) => String(input) === "/api/rooms" && init?.method === "POST"
      ? Promise.resolve(jsonResponse({ roomId: "ABC123" }))
      : defaultFetch(input, init));
    renderApp(chapterQuestionPath(chapterMeta.number, "practice-1"));

    fireEvent.click(await screen.findByRole("button", { name: "Create a room" }));

    expect((await screen.findAllByRole("button", { name: "Room ABC123" })).length).toBeGreaterThan(0);
    expect(screen.getByText("Practice 1")).toBeTruthy();
    expect(await screen.findByPlaceholderText("Type your answer in any language...")).toBeEnabled();
  });

  it("reports room connection errors and returns to the overview", async () => {
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-1", "MISSING"));

    expect(await screen.findByText("Room not found.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Create a room" })).toBeTruthy();
  });

  it("preserves roomId when generating a room from overview", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/participants/me")) return Promise.resolve(jsonResponse({ participationCreated: false }));
        if (url.endsWith("/me")) return Promise.resolve(jsonResponse({ id: "owner", email: "test@example.com", llmKey: { configured: false, lastFour: null, updatedAt: null } }));
      if (url.endsWith(`/chapters/${chapterMeta.id}`)) return Promise.resolve(jsonResponse(chapter));
      if (url.includes("/chapters") && !url.includes("/rooms")) {
        return Promise.resolve(jsonResponse([chapterMeta]));
      }
      if (url.endsWith("/rooms") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ roomId: "ABC123" }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderApp(chapterOverviewPath(chapterMeta.number));

    fireEvent.click(await screen.findByRole("button", { name: "Create a room" }));

    expect(await screen.findByText("Theory 1")).toBeTruthy();
    expect(screen.getAllByText("ABC123").length).toBeGreaterThan(0);
    expect(within(document.body).getByPlaceholderText("Type your answer in any language...")).toBeTruthy();
  });

  it("clears stale auth when the backend rejects room creation without rechecking the session", async () => {
    const defaultFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) => String(input) === "/api/rooms"
      ? Promise.resolve(jsonResponse({ error: "Please sign in to continue.", code: "AUTH_REQUIRED" }, 401))
      : defaultFetch(input, init));
    renderApp(chapterOverviewPath(chapterMeta.number));
    fireEvent.click(await screen.findByRole("button", { name: "Create a room" }));
    expect(await screen.findByText("Please sign in to continue.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in to create a room" })).toBeVisible();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/me")).toHaveLength(1);
  });

  it("redirects unknown question refs back to the chapter overview", async () => {
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-99", "ABC123"));

    await waitFor(async () => {
      expect(await screen.findByRole("button", { name: "Create a room" })).toBeTruthy();
    });
    expect(screen.queryByText("Theory 1")).toBeNull();
  });

  it("redirects zero-based question refs back to the chapter overview", async () => {
    renderApp(chapterQuestionPath(chapterMeta.number, "theory-0", "ABC123"));

    expect(await screen.findByRole("button", { name: "Create a room" })).toBeTruthy();
    expect(screen.queryByText("Theory 1")).toBeNull();
  });

  it("redirects legacy chapter id URLs to chapter number URLs", async () => {
    renderApp(`/chapters/${chapterMeta.id}/questions/theory-1?roomId=ABC123`);

    expect(await screen.findByText("Theory 1")).toBeTruthy();
    expect(screen.getByText("What is a process?")).toBeTruthy();
  });
});
