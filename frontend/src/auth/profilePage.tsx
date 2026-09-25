import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type { ProfileRoomSummary, UserProfile } from "@study-platform/shared";
import { useAuth } from "./context";
import { ApiRequestError, request, safeReturnTo, signInPath } from "./client";
import { chapterOverviewPath, chapterQuestionPath } from "../routes/paths";
import { clearRoomDraftUpdates } from "../utils/draftStorage";

type RoomFilter = "All" | "Author" | "Participant";
const ROOM_FILTERS: RoomFilter[] = ["All", "Author", "Participant"];

export default function ProfilePage() {
  const { profile, loading, error, refresh } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <p className="screen-message">Loading profile…</p>;
  if (error) return <section className="account-page"><p role="alert">{error}</p><button onClick={() => void refresh()}>Retry</button></section>;
  if (!profile) return <Navigate to={signInPath(`/profile${params.size ? `?${params}` : ""}`)} replace />;
  // Account changes discard the previous account's rooms, pending requests and key input.
  return <ProfileContent key={profile.id} profile={profile} />;
}

function ProfileContent({ profile }: { profile: UserProfile }) {
  const { refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [apiKey, setApiKey] = useState("");
  const [rooms, setRooms] = useState<ProfileRoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const [filter, setFilter] = useState<RoomFilter>("All");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const roomsRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const deleteButton = useRef<HTMLButtonElement | null>(null);
  const deleteDialog = useRef<HTMLDialogElement | null>(null);
  const cancelDeleteButton = useRef<HTMLButtonElement | null>(null);
  const filters = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dialog = deleteDialog.current;
    if (!dialog) return;
    if (confirmDelete !== null) {
      if (!dialog.open) dialog.showModal();
      cancelDeleteButton.current?.focus();
    } else if (dialog.open) {
      dialog.close();
      if (deleteButton.current?.isConnected) deleteButton.current.focus();
      else filters.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    }
  }, [confirmDelete]);

  const loadRooms = useCallback(async () => {
    if (!mounted.current) return;
    roomsRequest.current?.abort();
    const controller = new AbortController();
    roomsRequest.current = controller;
    setRoomsLoading(true);
    setRoomsError("");
    try {
      const result = await request<ProfileRoomSummary[]>("/me/rooms", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRooms(result);
      setRoomsLoaded(true);
    } catch {
      if (!controller.signal.aborted) setRoomsError("Couldn't load your rooms.");
    } finally {
      if (!controller.signal.aborted) setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void Promise.resolve().then(() => { if (active) return loadRooms(); });
    const onFocus = () => { void loadRooms(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; mounted.current = false; roomsRequest.current?.abort(); window.removeEventListener("focus", onFocus); };
  }, [loadRooms]);

  async function action(run: () => Promise<void>) {
    setPending(true); setError(""); setNotice("");
    try { await run(); } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); }
    finally { setPending(false); }
  }

  async function saveKey(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      try { await request("/me/llm-key", { method: "PUT", body: JSON.stringify({ apiKey }) }); }
      finally { setApiKey(""); }
      await refresh();
      setNotice("Key saved. Your rooms can now use AI features. Availability and credit are checked when you use them.");
    });
  }

  async function deleteRoom(roomId: string) {
    try { await request(`/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }); }
    catch (error) {
      // A room deleted in another tab is already gone; discard its stale card.
      if (!(error instanceof ApiRequestError && error.status === 404)) throw error;
    }
    setRooms(current => current.filter(room => room.roomId !== roomId));
    setConfirmDelete(null);
    await clearRoomDraftUpdates(roomId);
    await loadRooms();
  }

  const counts: Record<RoomFilter, number> = {
    All: rooms.length,
    Author: rooms.filter(room => room.isAuthor).length,
    Participant: rooms.filter(room => !room.isAuthor).length,
  };
  const visibleRooms = rooms.filter(room => filter === "All" || (filter === "Author" ? room.isAuthor : !room.isAuthor));

  return <section className="account-page profile-page">
    <div className="profile-heading">
      <div><p className="account-eyebrow">Your account</p><h1>Profile</h1><p>{profile.email}</p></div>
      <button className="secondary-button" disabled={pending} onClick={() => void action(async () => { await signOut(); navigate("/chapters"); })}>Sign out</button>
    </div>
    {error && confirmDelete === null && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
    {params.get("returnTo") && <Link className="return-to-room" to={safeReturnTo(params.get("returnTo"))}>Return to your room</Link>}
    <div className="profile-settings">
      <section className="profile-panel"><h2>OpenAI API key</h2><p>Anyone with one of your room links can check solutions and use voice input through your OpenAI account.</p>
        <p className="key-status">{profile.llmKey.configured ? `Saved key ending in ${profile.llmKey.lastFour}` : "No key saved"}</p>
        <form className="account-form" onSubmit={event => void saveKey(event)}><label>{profile.llmKey.configured ? "Replace API key" : "API key"}<input name="apiKey" type="password" required autoComplete="off" spellCheck={false} maxLength={1024} value={apiKey} onChange={event => setApiKey(event.target.value)} /></label>
          <div className="account-actions"><button className="primary-button" disabled={pending || !apiKey.trim()}>Save key</button>
            {profile.llmKey.configured && <button className="secondary-button" type="button" disabled={pending} onClick={() => void action(async () => { await request("/me/llm-key", { method: "DELETE" }); setApiKey(""); await refresh(); setNotice("Key removed. New AI requests are disabled in your rooms."); })}>Remove key</button>}</div>
        </form><p className="account-help">Stored encrypted. Saving does not make an OpenAI request. Rooms you participate in use their author's key.</p>
      </section>
    </div>
    <section aria-labelledby="your-rooms-title">
      <h2 id="your-rooms-title">Your rooms</h2>
      <p className="account-help">Rooms you create or open while signed in are saved here.</p>
      <div className="room-filters" role="group" aria-label="Filter rooms" ref={filters}>
        {ROOM_FILTERS.map(value => <button key={value} type="button" aria-pressed={filter === value}
          onClick={() => { setFilter(value); setConfirmDelete(null); }}>
          {value} {roomsLoaded && <span className="room-filter-count">{counts[value]}</span>}
        </button>)}
      </div>
      {roomsError && <div className="account-error room-list-error" role="alert"><span>{roomsError}</span>
        <button className="secondary-button" disabled={roomsLoading} onClick={() => void loadRooms()}>Retry</button>
      </div>}
      {roomsLoading && !roomsLoaded ? <p role="status">Loading rooms…</p> : !roomsLoaded ? null :
        visibleRooms.length === 0 ? <div className="profile-empty">
          <p>{filter === "Author" ? "You haven't created any rooms yet." : filter === "Participant"
            ? "Open a shared room link while signed in to find it here later."
            : "Your rooms will appear here. Create a room from a chapter, or open a shared room link while signed in."}</p>
          {filter !== "Participant" && <Link to="/chapters">Choose a chapter to get started</Link>}
        </div> : <>
          <p className="room-list-order">Most recently opened first</p>
          <div className="profile-rooms">{visibleRooms.map(room => {
            const path = room.continueQuestionRef ? chapterQuestionPath(room.chapterNumber, room.continueQuestionRef, room.roomId) : chapterOverviewPath(room.chapterNumber, room.roomId);
            const created = room.isAuthor && room.lastOpenedAt === room.createdAt;
            return <article className="profile-panel room-summary" key={room.roomId} aria-labelledby={`room-${room.roomId}-title`}>
              <div className="profile-heading">
                <div><p className="account-eyebrow">Chapter {room.chapterNumber} · {room.roomId}</p><h3 id={`room-${room.roomId}-title`}>{room.chapterName}</h3></div>
                <span className={`room-role${room.isAuthor ? " room-role-author" : ""}`}>{room.isAuthor ? "Author" : "Participant"}</span>
              </div>
              <div className="room-progress-label"><span>Shared progress</span><strong>{room.progress.checked}/{room.progress.total}</strong></div>
              <progress value={room.progress.checked} max={room.progress.total || 1} aria-label={`Shared progress in room ${room.roomId}`} />
              <p>Theory {room.progress.theory.checked}/{room.progress.theory.total} · Practice {room.progress.practice.checked}/{room.progress.practice.total} · Average {room.progress.averageScore === null ? "—" : `${room.progress.averageScore.toFixed(1)}/5`}</p>
              <p className="account-help">{created ? "Created" : "Last opened"} <time dateTime={room.lastOpenedAt}>{new Date(room.lastOpenedAt).toLocaleString()}</time>
                {" · "}Progress updated <time dateTime={room.updatedAt}>{new Date(room.updatedAt).toLocaleString()}</time></p>
              <div className="account-actions">
                <Link className="primary-button" to={path}>Continue</Link>
                <button className="secondary-button" disabled={pending} onClick={() => void action(async () => { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setNotice("Room link copied."); })}>Copy link</button>
                {room.isAuthor && <button className="text-danger" disabled={pending} onClick={event => { deleteButton.current = event.currentTarget; setError(""); setConfirmDelete(room.roomId); }}>Delete</button>}
              </div>
            </article>;
          })}</div>
        </>}
    </section>
    <dialog className="delete-confirm" ref={deleteDialog} aria-labelledby="delete-room-title" aria-describedby="delete-room-description"
      onCancel={event => { event.preventDefault(); if (!pending) setConfirmDelete(null); }}>
      <h2 id="delete-room-title">Delete this room for everyone?</h2>
      <p id="delete-room-description">Its saved progress will be deleted and everyone in the room will be disconnected.</p>
      {error && confirmDelete !== null && <p className="account-error" role="alert">{error}</p>}
      <div className="account-actions">
        <button className="text-danger" disabled={pending} onClick={() => { if (confirmDelete !== null) void action(() => deleteRoom(confirmDelete)); }}>Delete for everyone</button>
        <button className="secondary-button" ref={cancelDeleteButton} disabled={pending} onClick={() => setConfirmDelete(null)}>Cancel</button>
      </div>
    </dialog>
  </section>;
}
