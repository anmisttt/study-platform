import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentRoomProvider } from "../hooks/useCurrentRoom";
import { roomDestinationLabel } from "../routes/paths";
import RoomIndicator from "./roomIndicator";

const STORAGE_KEY = "study-platform.currentRoom";
const PROFILE = "/profile";
const OTHER_ROOM = "/chapters/3/overview?roomId=NEW222";

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    {[PROFILE, OTHER_ROOM].map(path => <button key={path} type="button" onClick={() => navigate(path)}>Go {path}</button>)}
    <p data-testid="location">{`${location.pathname}${location.search}`}</p>
  </>;
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <CurrentRoomProvider><RoomIndicator /><Probe /></CurrentRoomProvider>
  </MemoryRouter>);
}

const location = () => screen.getByTestId("location").textContent;
const openMenu = (roomId = "ABC123") => {
  fireEvent.click(screen.getByRole("button", { name: `Room ${roomId}` }));
  return within(screen.getByRole("menu"));
};

beforeEach(() => {
  localStorage.clear();
  // jsdom does not implement the native dialog methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("RoomIndicator", () => {
  it("shows nothing without a current room", () => {
    renderAt("/chapters");
    expect(screen.queryByRole("button", { name: /^Room / })).toBeNull();
  });

  it("remembers the room from the URL and offers copy and leave inside it", () => {
    renderAt("/chapters/1/questions/theory-1?roomId=ABC123");
    const menu = openMenu();
    expect(menu.queryByRole("menuitem", { name: /Get back/ })).toBeNull();
    expect(menu.getByRole("menuitem", { name: "Copy room link" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Leave room…" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ roomId: "ABC123", lastPath: "/chapters/1/questions/theory-1?roomId=ABC123" });
  });

  it("keeps the room on pages without it and gets back to the last room page", () => {
    renderAt("/chapters/5/questions/practice-4?roomId=ABC123");
    fireEvent.click(screen.getByRole("button", { name: `Go ${PROFILE}` }));
    const menu = openMenu();
    const getBack = menu.getByRole("menuitem", { name: /Get back to your room/ });
    expect(getBack).toHaveTextContent("Chapter 5 · Practice 4");
    fireEvent.click(getBack);
    expect(location()).toBe("/chapters/5/questions/practice-4?roomId=ABC123");
  });

  it("restores the room from storage and lets another room's link replace it", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId: "OLD111", lastPath: "/chapters/2/overview?roomId=OLD111" }));
    renderAt("/chapters");
    expect(screen.getByRole("button", { name: "Room OLD111" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `Go ${OTHER_ROOM}` }));
    expect(screen.getByRole("button", { name: "Room NEW222" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).roomId).toBe("NEW222");
  });

  it("copies the room link and confirms it", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderAt("/chapters/1/overview?roomId=ABC123");
    const menu = openMenu();
    await act(async () => { fireEvent.click(menu.getByRole("menuitem", { name: "Copy room link" })); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/chapters/1/overview?roomId=ABC123`);
    expect(menu.getByRole("menuitem", { name: "✓ Link copied" })).toBeTruthy();
    expect(screen.getByRole("status")).toHaveTextContent("Room link copied");
  });

  it("leaves only after confirmation and keeps the page without the room", () => {
    renderAt("/chapters/1/questions/theory-1?roomId=ABC123");
    fireEvent.click(openMenu().getByRole("menuitem", { name: "Leave room…" }));
    const dialog = screen.getByRole("dialog", { name: "Leave room ABC123?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay in room" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    fireEvent.click(openMenu().getByRole("menuitem", { name: "Leave room…" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Leave room ABC123?" })).getByRole("button", { name: "Leave room" }));
    expect(location()).toBe("/chapters/1/questions/theory-1");
    expect(screen.queryByRole("button", { name: /^Room / })).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("leaves the room here too when another tab leaves it, without writing it back", () => {
    renderAt("/chapters/1/questions/theory-1?roomId=ABC123");
    const oldValue = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, oldValue, newValue: null })); });

    expect(location()).toBe("/chapters/1/questions/theory-1");
    expect(screen.queryByRole("button", { name: /^Room / })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Go ${PROFILE}` }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps its room when another tab leaves a different room, and adopts a room chosen elsewhere", () => {
    renderAt("/profile");
    const other = JSON.stringify({ roomId: "OTHER1", lastPath: "/chapters/2/overview?roomId=OTHER1" });
    localStorage.setItem(STORAGE_KEY, other);
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, oldValue: null, newValue: other })); });
    expect(screen.getByRole("button", { name: "Room OTHER1" })).toBeTruthy();

    const gone = JSON.stringify({ roomId: "GONE11", lastPath: "/chapters/1/overview?roomId=GONE11" });
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, oldValue: gone, newValue: null })); });
    expect(screen.getByRole("button", { name: "Room OTHER1" })).toBeTruthy();
  });

  it("closes the menu with Escape", () => {
    renderAt("/chapters/1/overview?roomId=ABC123");
    openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Room ABC123" })).toHaveFocus();
  });
});

describe("roomDestinationLabel", () => {
  it("names the chapter and question of the last room page", () => {
    expect(roomDestinationLabel("/chapters/5/questions/practice-4?roomId=A")).toBe("Chapter 5 · Practice 4");
    expect(roomDestinationLabel("/chapters/2/questions/theory-1?roomId=A")).toBe("Chapter 2 · Theory 1");
    expect(roomDestinationLabel("/chapters/3/overview?roomId=A")).toBe("Chapter 3");
    expect(roomDestinationLabel("/chapters?roomId=A")).toBe("Chapter list");
  });
});
