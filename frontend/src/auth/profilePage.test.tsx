import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProfileRoomSummary } from "@study-platform/shared";
import { useAuth } from "./context";
import ProfilePage from "./profilePage";

vi.mock("./context", () => ({ useAuth: vi.fn() }));
let auth: ReturnType<typeof useAuth>;
function room(roomId: string, isAuthor: boolean): ProfileRoomSummary {
  return {
    roomId, isAuthor, chapterId: "chapter", chapterNumber: 1, chapterName: `Chapter for ${roomId}`,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z",
    joinedAt: "2026-01-01T00:00:00Z", lastOpenedAt: "2026-02-02T00:00:00Z", continueQuestionRef: "theory-1",
    progress: { checked: 2, total: 4, theory: { checked: 1, total: 2 }, practice: { checked: 1, total: 2 }, averageScore: 4 },
  };
}
function response(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status }); }
function showProfile() { return render(<MemoryRouter><ProfilePage /></MemoryRouter>); }
function filters() { return within(screen.getByRole("group", { name: "Filter rooms" })); }
beforeEach(() => {
  // jsdom does not implement the native dialog methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  auth = { profile: { id: "a", email: "a@example.com", llmKey: { configured: false, lastFour: null, updatedAt: null } }, loading: false, error: "", refresh: vi.fn(async () => {}), signOut: vi.fn(async () => {}) };
  vi.mocked(useAuth).mockImplementation(() => auth);
  vi.stubGlobal("fetch", vi.fn(async () => response([room("owned", true), room("joined", false)])));
});
afterEach(() => { vi.unstubAllGlobals(); });

it("filters All, Author and Participant, showing deletion only for the author", async () => {
  showProfile();
  await screen.findByRole("heading", { name: "Chapter for joined" });
  expect(filters().getByRole("button", { name: "All 2" })).toHaveAttribute("aria-pressed", "true");
  const owned = within(screen.getByRole("article", { name: "Chapter for owned" }));
  const joined = within(screen.getByRole("article", { name: "Chapter for joined" }));
  expect(owned.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  expect(joined.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  expect(joined.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/chapters/1/questions/theory-1?roomId=joined");
  expect(joined.getByText("Shared progress")).toBeInTheDocument();
  expect(joined.getByText(/Last opened/)).toHaveTextContent("Progress updated");
  fireEvent.click(filters().getByRole("button", { name: "Participant 1" }));
  expect(screen.queryByRole("heading", { name: "Chapter for owned" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Chapter for joined" })).toBeInTheDocument();
  fireEvent.click(filters().getByRole("button", { name: "Author 1" }));
  expect(screen.getByRole("heading", { name: "Chapter for owned" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Chapter for joined" })).not.toBeInTheDocument();
});

it("retains rooms on a failed refresh and allows retry", async () => {
  showProfile();
  await screen.findByRole("heading", { name: "Chapter for joined" });
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
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Chapter for owned" })).not.toBeInTheDocument());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/rooms/owned") && init?.method === "DELETE")).toBe(true);
});

it("ignores late room responses after changing accounts", async () => {
  let complete!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { complete = resolve; })).mockResolvedValueOnce(response([room("other-account", false)]));
  const { rerender } = showProfile();
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  auth.profile = { ...auth.profile!, id: "b", email: "b@example.com" };
  rerender(<MemoryRouter><ProfilePage /></MemoryRouter>);
  await screen.findByRole("heading", { name: "Chapter for other-account" });
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => { complete(response([room("old-account", true)])); });
  expect(screen.queryByRole("heading", { name: "Chapter for old-account" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(1);
});
