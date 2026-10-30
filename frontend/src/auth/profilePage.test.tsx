import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProfileRoomSummary } from "@study-platform/shared";
import { useAuth } from "./context";
import ProfilePage from "./profilePage";

vi.mock("./context", () => ({ useAuth: vi.fn() }));
let auth: ReturnType<typeof useAuth>;
function room(roomId: string, isAuthor: boolean, overrides: Partial<ProfileRoomSummary> = {}): ProfileRoomSummary {
  return {
    roomId, isAuthor,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z",
    joinedAt: "2026-01-01T00:00:00Z", lastOpenedAt: "2026-02-02T00:00:00Z",
    chapters: [{ chapterId: "chapter", number: 1, name: `Chapter for ${roomId}`, checked: 2, total: 4,
      progress: { checked: 2, total: 4, theory: { checked: 1, total: 2 }, practice: { checked: 1, total: 2 }, averageScore: 4 },
      nextQuestionRef: "theory-1" }],
    activeChapterId: "chapter",
    roomProgress: { checked: 2, total: 4, averageScore: 4 },
    continue: { chapterNumber: 1, questionRef: "theory-1" },
    ...overrides,
  };
}
function response(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status }); }
function showProfile() { return render(<MemoryRouter><ProfilePage /></MemoryRouter>); }
function filters() { return within(screen.getByRole("group", { name: "Filter rooms" })); }
beforeEach(() => {
  // jsdom does not implement the native dialog methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  auth = { profile: { id: "a", email: "a@example.com", llmKey: { configured: false, lastFour: null, updatedAt: null } }, loading: false, error: "", updateKeyStatus: vi.fn(), signOut: vi.fn(async () => {}) };
  vi.mocked(useAuth).mockImplementation(() => auth);
  vi.stubGlobal("fetch", vi.fn(async () => response([room("owned", true), room("joined", false)])));
});
afterEach(() => { vi.unstubAllGlobals(); });

it("filters All, Author and Participant, showing deletion only for the author", async () => {
  showProfile();
  await screen.findByRole("heading", { name: "Chapter 1 · Chapter for joined" });
  expect(filters().getByRole("button", { name: "All 2" })).toHaveAttribute("aria-pressed", "true");
  const owned = within(screen.getByRole("article", { name: "Chapter 1 · Chapter for owned" }));
  const joined = within(screen.getByRole("article", { name: "Chapter 1 · Chapter for joined" }));
  expect(owned.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  expect(joined.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  expect(joined.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/chapters/1/questions/theory-1?roomId=joined");
  expect(joined.getByText("Shared progress")).toBeInTheDocument();
  expect(joined.getByText(/Last opened/)).toHaveTextContent("Progress updated");
  fireEvent.click(filters().getByRole("button", { name: "Participant 1" }));
  expect(screen.queryByRole("heading", { name: "Chapter 1 · Chapter for owned" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Chapter 1 · Chapter for joined" })).toBeInTheDocument();
  fireEvent.click(filters().getByRole("button", { name: "Author 1" }));
  expect(screen.getByRole("heading", { name: "Chapter 1 · Chapter for owned" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Chapter 1 · Chapter for joined" })).not.toBeInTheDocument();
});

it("retains rooms on a failed refresh and allows retry", async () => {
  showProfile();
  await screen.findByRole("heading", { name: "Chapter 1 · Chapter for joined" });
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Offline"));
  fireEvent(window, new Event("focus"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your rooms.");
  expect(screen.getAllByRole("article")).toHaveLength(2);
  vi.mocked(fetch).mockResolvedValueOnce(response([room("joined", false)]));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(filters().getByRole("button", { name: "All 1" })).toBeInTheDocument();
});

it("distinguishes initial loading, failed loading, and empty filters", async () => {
  let complete!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  showProfile();
  expect(screen.getByRole("status")).toHaveTextContent("Loading rooms");
  expect(screen.queryByText(/Your rooms will appear here/)).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(async () => { complete(response({ error: "Unavailable" }, 503)); });
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your rooms");
  expect(screen.queryByText(/Your rooms will appear here/)).not.toBeInTheDocument();
  vi.mocked(fetch).mockResolvedValueOnce(response([]));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText(/Your rooms will appear here/)).toBeInTheDocument();
  fireEvent.click(filters().getByRole("button", { name: "Author 0" }));
  expect(screen.getByText("You haven't created any rooms yet.")).toBeInTheDocument();
  fireEvent.click(filters().getByRole("button", { name: "Participant 0" }));
  expect(screen.getByText("Open a shared room link while signed in to find it here later.")).toBeInTheDocument();
});

it("confirms deletion for everyone and removes a card already deleted elsewhere", async () => {
  showProfile();
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  const confirmation = within(screen.getByRole("dialog", { name: "Delete this room for everyone?" }));
  expect(confirmation.getByRole("button", { name: "Cancel" })).toHaveFocus();
  fireEvent.click(confirmation.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  vi.mocked(fetch).mockResolvedValueOnce(response({ error: "Already deleted" }, 404))
    .mockResolvedValueOnce(response([room("joined", false)]));
  fireEvent.click(screen.getByRole("button", { name: "Delete for everyone" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Chapter 1 · Chapter for owned" })).not.toBeInTheDocument());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/rooms/owned") && init?.method === "DELETE")).toBe(true);
});

it("cancels pending room requests when leaving the profile", async () => {
  let complete!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const { unmount } = showProfile();
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  unmount();
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => { complete(response([room("owned", true)])); });
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

it("shows an empty room with a hint and continues at the first question", async () => {
  vi.mocked(fetch).mockResolvedValue(response([room("empty", true, { chapters: [], activeChapterId: null, roomProgress: { checked: 0, total: 0, averageScore: null } })]));
  showProfile();
  const card = within(await screen.findByRole("article", { name: "Empty room" }));
  expect(card.getByText("Room · empty")).toBeInTheDocument();
  expect(card.getByText(/No answers yet/)).toBeInTheDocument();
  expect(card.queryByText("Shared progress")).not.toBeInTheDocument();
  expect(card.queryByRole("list")).not.toBeInTheDocument();
  expect(card.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/chapters/1/questions/theory-1?roomId=empty");
});

it("shows one chapter without a room total and with a single active chip", async () => {
  showProfile();
  const card = within(await screen.findByRole("article", { name: "Chapter 1 · Chapter for joined" }));
  expect(card.queryByText(/^All \d+ chapters/)).not.toBeInTheDocument();
  const chips = card.getAllByRole("button", { name: /^Chapter \d+,/ });
  expect(chips.map(chip => chip.getAttribute("aria-label"))).toEqual(["Chapter 1, Chapter for joined: 2 of 4"]);
  expect(chips[0]).toHaveAttribute("aria-pressed", "true");
  expect(card.getByText("Continue picks up at Chapter 1 Theory 1")).toBeInTheDocument();
});

it("shows the active chapter first and switches the card's chapter and Continue from its chips, which are not links", async () => {
  vi.mocked(fetch).mockResolvedValue(response([room("multi", false, {
    chapters: [
      { chapterId: "c3", number: 3, name: "Data Models", checked: 17, total: 17,
        progress: { checked: 17, total: 17, theory: { checked: 12, total: 12 }, practice: { checked: 5, total: 5 }, averageScore: 4.2 },
        nextQuestionRef: "theory-1" },
      { chapterId: "c5", number: 5, name: "Encoding", checked: 11, total: 25,
        progress: { checked: 11, total: 25, theory: { checked: 8, total: 20 }, practice: { checked: 3, total: 5 }, averageScore: 3.5 },
        nextQuestionRef: "practice-4" },
    ],
    activeChapterId: "c5",
    roomProgress: { checked: 28, total: 42, averageScore: 3.6 },
    continue: { chapterNumber: 5, questionRef: "practice-4" },
  })]));
  showProfile();
  const card = within(await screen.findByRole("article", { name: "Chapter 5 · Encoding" }));
  expect(card.getByRole("heading")).toHaveTextContent("Chapter 5 · Encoding");
  expect(card.getByText("Shared progress").nextElementSibling).toHaveTextContent("11/25");
  expect(card.getByText("Theory 8/20 · Practice 3/5 · Average 3.5/5")).toBeInTheDocument();
  expect(card.getByText("All 2 chapters · 28/42 · Average 3.6/5")).toBeInTheDocument();
  const chips = card.getAllByRole("button", { name: /^Chapter \d+,/ });
  expect(chips.map(chip => chip.getAttribute("aria-label"))).toEqual(["Chapter 3, Data Models: 17 of 17", "Chapter 5, Encoding: 11 of 25"]);
  expect(chips.map(chip => chip.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  expect(card.getAllByRole("link").map(link => link.textContent)).toEqual(["Continue"]);
  expect(card.getByText("Continue picks up at Chapter 5 Practice 4")).toBeInTheDocument();
  expect(card.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/chapters/5/questions/practice-4?roomId=multi");

  fireEvent.click(chips[0]);
  expect(card.getByRole("heading")).toHaveTextContent("Chapter 3 · Data Models");
  expect(card.getByText("Shared progress").nextElementSibling).toHaveTextContent("17/17");
  expect(card.getByRole("progressbar")).toHaveAttribute("value", "17");
  expect(card.getByText("Theory 12/12 · Practice 5/5 · Average 4.2/5")).toBeInTheDocument();
  expect(chips.map(chip => chip.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  expect(card.getByText("Continue picks up at Chapter 3 Theory 1")).toBeInTheDocument();
  expect(card.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/chapters/3/questions/theory-1?roomId=multi");
});
