import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { chapterMeta, roomDetails } from "./test/fixtures";
import { chapterOverviewPath, chapterQuestionPath, chaptersPath } from "./routes/paths";

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
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
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
      constructor(_url: string) {
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }
      send(data: string) {
        const message = JSON.parse(data) as { type?: string; roomId?: string; questionId?: string };
        if (message.type === "subscribe" && message.roomId && message.questionId) {
          queueMicrotask(() => {
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({
                  type: "snapshot",
                  roomId: message.roomId,
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

    expect(await screen.findByText(/free platform to practice/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /1\. Introduction/ })).toBeTruthy();
  });

  it("opens a chapter overview from the table of contents", async () => {
    renderApp(chaptersPath());

    fireEvent.click(await screen.findByRole("button", { name: /1\. Introduction/ }));

    expect(await screen.findByRole("heading", { name: "Introduction" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate new room" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join room" })).toBeTruthy();
  });

  it("keeps roomId on question deep links and renders the practice shell", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/chapters") && !url.includes("/rooms")) {
        return Promise.resolve(jsonResponse([chapterMeta]));
      }
      if (url.includes("/rooms/ABC123")) {
        return Promise.resolve(jsonResponse(roomDetails));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderApp(chapterQuestionPath(chapterMeta.id, "theory-0", "ABC123"));

    expect(await screen.findByText("Theory 1")).toBeTruthy();
    expect(screen.getByText("What is a process?")).toBeTruthy();

    const roomLabels = screen.getAllByText("Room ID:");
    expect(roomLabels.length).toBeGreaterThan(0);
    expect(screen.getAllByText("ABC123").length).toBeGreaterThan(0);
  });

  it("redirects practice routes without a roomId back to overview with an error", async () => {
    renderApp(chapterQuestionPath(chapterMeta.id, "theory-0"));

    expect(await screen.findByText("A room ID is required to practice.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate new room" })).toBeTruthy();
  });

  it("preserves roomId when generating a room from overview", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/chapters") && !url.includes("/rooms")) {
        return Promise.resolve(jsonResponse([chapterMeta]));
      }
      if (url.endsWith("/rooms") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ roomId: "ABC123" }));
      }
      if (url.includes("/rooms/ABC123")) {
        return Promise.resolve(jsonResponse(roomDetails));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderApp(chapterOverviewPath(chapterMeta.id));

    fireEvent.click(await screen.findByRole("button", { name: "Generate new room" }));

    expect(await screen.findByText("Theory 1")).toBeTruthy();
    expect(screen.getAllByText("ABC123").length).toBeGreaterThan(0);
    expect(within(document.body).getByPlaceholderText("Type your answer in any language...")).toBeTruthy();
  });

  it("redirects unknown question refs back to the chapter overview", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/chapters") && !url.includes("/rooms")) {
        return Promise.resolve(jsonResponse([chapterMeta]));
      }
      if (url.includes("/rooms/ABC123")) {
        return Promise.resolve(jsonResponse(roomDetails));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderApp(chapterQuestionPath(chapterMeta.id, "theory-99", "ABC123"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate new room" })).toBeTruthy();
    });
    expect(screen.queryByText("Theory 1")).toBeNull();
  });
});
