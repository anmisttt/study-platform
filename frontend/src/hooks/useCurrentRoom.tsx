import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { chaptersPath, roomIdFromSearch } from "../routes/paths";

const STORAGE_KEY = "study-platform.currentRoom";

export type CurrentRoom = {
  roomId: string;
  /** The last chapter page opened in the room; "Get back to your room" returns here. */
  lastPath: string;
};

type CurrentRoomContextValue = {
  currentRoom: CurrentRoom | null;
  inRoomContext: boolean;
  /** The URL's room, else the remembered one; used in every chapter link the app builds. */
  linkRoomId: string | undefined;
  leaveRoom: () => void;
  forgetRoom: (roomId: string) => void;
};

const CurrentRoomContext = createContext<CurrentRoomContextValue>({
  currentRoom: null,
  inRoomContext: false,
  linkRoomId: undefined,
  leaveRoom: () => {},
  forgetRoom: () => {},
});

// Storage can be unavailable (private windows, blocked site data); the room link still works then.
function readStoredRoom(raw?: string | null): CurrentRoom | null {
  try {
    const value = JSON.parse((raw === undefined ? localStorage.getItem(STORAGE_KEY) : raw) ?? "null") as Partial<CurrentRoom> | null;
    return typeof value?.roomId === "string" && typeof value.lastPath === "string"
      ? { roomId: value.roomId, lastPath: value.lastPath }
      : null;
  } catch {
    return null;
  }
}

function writeStoredRoom(room: CurrentRoom | null): void {
  try {
    if (room) localStorage.setItem(STORAGE_KEY, JSON.stringify(room));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (error: unknown) {
    console.error("Couldn't save the current room; it is kept for this tab only.", error);
  }
}

function isChapterPage(pathname: string): boolean {
  return /^\/chapters\/[^/]+\/(overview|questions\/[^/]+)$/.test(pathname);
}

function withoutRoomId(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("roomId");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function CurrentRoomProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [storedRoom, setStoredRoom] = useState<CurrentRoom | null>(() => readStoredRoom());
  // Until navigation drops ?roomId, the URL still names the room being left; ignore it meanwhile.
  const [leavingRoomId, setLeavingRoomId] = useState<string | null>(null);
  const searchRoomId = roomIdFromSearch(location.search);
  const urlRoomId = searchRoomId === leavingRoomId ? null : searchRoomId;

  if (leavingRoomId && searchRoomId !== leavingRoomId) setLeavingRoomId(null);

  // The URL wins: opening another room's link replaces the current room.
  const currentRoom = useMemo<CurrentRoom | null>(() => {
    if (!urlRoomId) return storedRoom;
    if (isChapterPage(location.pathname)) return { roomId: urlRoomId, lastPath: `${location.pathname}${location.search}` };
    return storedRoom?.roomId === urlRoomId ? storedRoom : { roomId: urlRoomId, lastPath: chaptersPath(urlRoomId) };
  }, [location.pathname, location.search, storedRoom, urlRoomId]);

  if (currentRoom && (currentRoom.roomId !== storedRoom?.roomId || currentRoom.lastPath !== storedRoom.lastPath)) {
    setStoredRoom(currentRoom);
  }

  useEffect(() => {
    if (storedRoom) writeStoredRoom(storedRoom);
  }, [storedRoom]);

  const forgetRoom = useCallback((roomId: string) => {
    setStoredRoom((room) => {
      if (room?.roomId !== roomId) return room;
      writeStoredRoom(null);
      return null;
    });
  }, []);

  const leaveRoom = useCallback(() => {
    if (!currentRoom) return;
    writeStoredRoom(null);
    setStoredRoom(null);
    if (urlRoomId) setLeavingRoomId(urlRoomId);
    if (urlRoomId) navigate(withoutRoomId(location.pathname, location.search), { replace: true });
  }, [currentRoom, location.pathname, location.search, navigate, urlRoomId]);

  // Leaving in another tab leaves here too, so this tab can't write the left room back.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const next = readStoredRoom(event.newValue);
      if (next) setStoredRoom(next);
      else if (readStoredRoom(event.oldValue)?.roomId === currentRoom?.roomId) leaveRoom();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentRoom?.roomId, leaveRoom]);

  const value = useMemo<CurrentRoomContextValue>(() => ({
    currentRoom,
    inRoomContext: Boolean(currentRoom && urlRoomId === currentRoom.roomId),
    linkRoomId: currentRoom?.roomId,
    leaveRoom,
    forgetRoom,
  }), [currentRoom, forgetRoom, leaveRoom, urlRoomId]);

  return <CurrentRoomContext.Provider value={value}>{children}</CurrentRoomContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentRoom(): CurrentRoomContextValue {
  return useContext(CurrentRoomContext);
}
