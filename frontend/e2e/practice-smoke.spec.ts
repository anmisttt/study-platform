import { expect, test, type Page, type Route } from "@playwright/test";

const chapterMeta = {
  id: "first_chapter",
  number: 1,
  name: "Introduction",
  theoryCount: 1,
  practiceCount: 1,
};

const chapter = {
  id: chapterMeta.id,
  number: chapterMeta.number,
  name: chapterMeta.name,
  theory: [
    {
      question: "What is a process?",
      answer: "An instance of a running program.",
    },
  ],
  practice: [
    {
      task: "Implement a counter",
      question: "Write a thread-safe counter.",
      answer: "Use an atomic integer.",
    },
  ],
};

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockBackend(page: Page, { signedIn = true }: { signedIn?: boolean } = {}): Promise<void> {
  await page.addInitScript(() => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
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
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));

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
        const message = JSON.parse(data) as {
          type?: string;
          chapterId?: string;
          questionId?: string;
        };
        if (message.type === "watch_chapter" && this.roomId) {
          queueMicrotask(() => {
            this.onmessage?.(new MessageEvent("message", {
              data: JSON.stringify({
                type: "room_snapshot",
                answers: { roomId: this.roomId, chapterId: message.chapterId, theory: [], practice: [] },
              }),
            }));
          });
        }
        if (message.type === "watch_question" && this.roomId && message.questionId) {
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

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "") || "/";

    if (request.method() === "GET" && path === "/me") {
      await fulfillJson(
        route,
        signedIn
          ? { id: "owner", email: "owner@example.com", llmKey: { configured: true, lastFour: "1234", updatedAt: null } }
          : null,
      );
      return;
    }
    if (request.method() === "GET" && path === "/chapters") {
      await fulfillJson(route, [chapterMeta]);
      return;
    }

    if (request.method() === "GET" && path === `/chapters/${chapterMeta.id}`) {
      await fulfillJson(route, chapter);
      return;
    }

    if (request.method() === "POST" && path === "/rooms") {
      await fulfillJson(route, { roomId: "ABC123" });
      return;
    }

    if (request.method() === "POST" && path === `/rooms/ABC123/chapters/${chapterMeta.id}/questions/theory-1/check`) {
      await fulfillJson(route, {
        rating: 4,
        comment: "Solid answer.",
        revision: 1,
      });
      return;
    }

    await fulfillJson(route, { error: `Unhandled mock: ${request.method()} ${path}` }, 500);
  });
}

test("practice happy path: generate room, answer, check", async ({ page }) => {
  await mockBackend(page);

  await page.goto("/chapters");
  await page.getByRole("button", { name: /1\. Introduction/ }).click();
  await expect(page.getByRole("heading", { name: "Introduction" })).toBeVisible();

  await page.getByRole("button", { name: "Create a room", exact: true }).click();
  await expect(page.getByText("Theory 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Room ABC123" })).toBeVisible();

  const answer = page.getByPlaceholder("Type your answer in any language...");
  await answer.fill("A process is a running program.");
  await page.getByRole("button", { name: "Check" }).click();

  const resultCard = page.locator(".result-card");
  await expect(resultCard).toContainText("Rating:");
  await expect(resultCard).toContainText("4/5");
  await expect(resultCard).toContainText("A process is a running program.");
  await expect(resultCard).toContainText("Solid answer.");
});

test("signed-out visitors can read a roomless task link and are asked to sign in to check", async ({ page }) => {
  await mockBackend(page, { signedIn: false });

  await page.goto("/chapters/1/questions/theory-1");
  await expect(page.getByText("What is a process?")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Room / })).toHaveCount(0);
  await expect(page.getByPlaceholder("Create a room to answer…")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check", exact: true })).toHaveAttribute("aria-disabled", "true");

  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page).toHaveURL(/\/chapters\/1\/questions\/practice-1$/);
  await expect(page.getByText("Write a thread-safe counter.")).toBeVisible();

  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(page).toHaveURL(/\/chapters\/1\/questions\/theory-1$/);

  await page.getByRole("button", { name: "Show reference answer" }).click();
  await expect(page.getByText("An instance of a running program.")).toBeVisible();

  await page.getByRole("button", { name: "Sign in to create a room" }).click();
  await expect(page).toHaveURL(
    `/login?returnTo=${encodeURIComponent("/chapters/1/questions/theory-1")}`,
  );
});
