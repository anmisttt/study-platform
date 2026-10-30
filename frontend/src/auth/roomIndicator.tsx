import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentRoom } from "../hooks/useCurrentRoom";
import { roomDestinationLabel } from "../routes/paths";

const COPIED_FEEDBACK_MS = 2000;

export default function RoomIndicator() {
  const { currentRoom, inRoomContext, leaveRoom } = useCurrentRoom();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (confirmLeave && !element.open) element.showModal();
    if (!confirmLeave && element.open) element.close();
  }, [confirmLeave]);

  if (!currentRoom) return null;
  const { roomId, lastPath } = currentRoom;

  function closeMenu(): void {
    setOpen(false);
    pill.current?.focus();
  }

  async function copyRoomLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${lastPath}`);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return <div className="room-indicator" ref={root} onKeyDown={event => { if (event.key === "Escape" && open) closeMenu(); }}>
    <button type="button" className="room-pill" ref={pill} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      aria-label={`Room ${roomId}`} onClick={() => setOpen(value => !value)}>
      <span className="room-pill-dot" aria-hidden="true" />
      <span className="room-pill-word">Room</span>
      <span className="room-pill-id">{roomId}</span>
      <svg className="room-pill-chevron" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
    </button>
    {open && <div className="room-menu" id={menuId} role="menu" aria-label={`Room ${roomId}`}>
      <div className="room-menu-header">
        <p className="room-menu-title">Room <span className="room-pill-id">{roomId}</span></p>
        <p className="room-menu-help">Your answers are saved in this room. Anyone with the link can join.</p>
      </div>
      {!inRoomContext && <button type="button" role="menuitem" className="room-menu-item"
        onClick={() => { setOpen(false); navigate(lastPath); }}>
        <span>Get back to your room</span>
        <span className="room-menu-subline">{roomDestinationLabel(lastPath)}</span>
      </button>}
      <button type="button" role="menuitem" className={`room-menu-item${copyState === "copied" ? " room-menu-item-copied" : ""}`}
        onClick={() => void copyRoomLink()}>
        {copyState === "copied" ? "✓ Link copied" : copyState === "failed" ? `Couldn't copy. Room ID ${roomId}` : "Copy room link"}
      </button>
      <hr className="room-menu-divider" />
      <button type="button" role="menuitem" className="room-menu-item" onClick={() => { setOpen(false); setConfirmLeave(true); }}>Leave room…</button>
    </div>}
    <span className="visually-hidden" role="status">{copyState === "copied" ? "Room link copied" : ""}</span>
    <dialog className="delete-confirm" ref={dialog} aria-labelledby={`${menuId}-leave-title`}
      onCancel={event => { event.preventDefault(); setConfirmLeave(false); }}>
      <h2 id={`${menuId}-leave-title`}>Leave room {roomId}?</h2>
      <p>Your answers stay saved in this room, and the room keeps working for everyone in it. To come back later, open the room link or find the room in your profile.</p>
      <p><button type="button" className="link-button" onClick={() => void copyRoomLink()}>
        {copyState === "copied" ? "✓ Link copied" : "Copy room link first"}
      </button></p>
      <div className="account-actions">
        <button type="button" className="secondary-button" autoFocus onClick={() => setConfirmLeave(false)}>Stay in room</button>
        <button type="button" className="primary-button" onClick={() => { setConfirmLeave(false); leaveRoom(); }}>Leave room</button>
      </div>
    </dialog>
  </div>;
}
