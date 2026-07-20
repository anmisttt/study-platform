import { expect, test, type Page, type Route } from "@playwright/test";

const chapterMeta = {
  id: "first_chapter",
  number: 1,
  name: "Introduction",
  theoryCount: 1,
  practiceCount: 1,
};

const roomDetails = {
  roomId: "ABC123",
  chapterId: chapterMeta.id,
  number: chapterMeta.number,
  name: chapterMeta.name,
  theory: [
    {
      question: "What is a process?",
      answer: "An instance of a running program.",
      revision: 0,
    },
  ],
  practice: [
    {
      task: "Implement a counter",
      description: "Write a thread-safe counter.",
      solutions: [{ quality: "good", solution: "Use an atomic integer." }],
      revision: 0,
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

async function mockBackend(page: Page): Promise<void> {
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

      constructor(_url: string) {
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }

      send(data: string) {
        const message = JSON.parse(data) as {
          type?: string;
          roomId?: string;
          questionId?: string;
        };
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

    if (request.method() === "GET" && path === "/chapters") {
      await fulfillJson(route, [chapterMeta]);
      return;
    }

    if (request.method() === "POST" && path === "/rooms") {
      await fulfillJson(route, { roomId: "ABC123" });
      return;
    }

    if (request.method() === "GET" && path === "/rooms/ABC123") {
      await fulfillJson(route, roomDetails);
      return;
    }

    if (request.method() === "POST" && path === "/rooms/ABC123/questions/theory/0/check") {
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

  await page.getByRole("button", { name: "Generate new room" }).click();
  await expect(page.getByText("Theory 1")).toBeVisible();
  await expect(page.getByText("ABC123").first()).toBeVisible();

  const answer = page.getByPlaceholder("Type your answer in any language...");
  await answer.fill("A process is a running program.");
  await page.getByRole("button", { name: "Check" }).click();

  const resultCard = page.locator(".result-card");
  await expect(resultCard).toContainText("Rating:");
  await expect(resultCard).toContainText("4/5");
  await expect(resultCard).toContainText("A process is a running program.");
  await expect(resultCard).toContainText("Solid answer.");
});
