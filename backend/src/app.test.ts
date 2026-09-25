import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "openai";
import Database from "better-sqlite3";
import { createApplication, type LlmServices } from "./app.js";
import { RoomsDb } from "./db/roomsDb.js";
import { createAuth, type AuthEmail } from "./auth.js";
import { chapters } from "./chapters.js";
import { getRoomDetails } from "./db/roomContext.js";

const origin = "http://localhost:5173";
const ownerKey = "sk-owner-private-key-123456";
let db: RoomsDb;
let server: Server;
let base: string;
let emails: AuthEmail[];
let services: LlmServices;
let application: ReturnType<typeof createApplication>;
const config = {
  publicOrigin: origin, trustedOrigins: [origin], production: false,
  authSecret: "test-auth-secret-at-least-32-characters-long", encryptionSecret: "a".repeat(64),
  google: { clientId: "google-test", clientSecret: "google-secret" },
  github: { clientId: "github-test", clientSecret: "github-secret" },
};
async function api(path: string, method = "GET", body?: unknown, cookie = "", requestOrigin = origin) {
  return fetch(`${base}${path}`, { method, redirect: "manual", headers: {
    Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function user(email = "owner@example.com") {
  const signup = await api("/api/auth/sign-up/email", "POST", { email, password: "test-password-123" });
  expect(signup.status).toBe(200);
  const body = await signup.json();
  const verification = new URL(emails.at(-1)!.text.split(" ").at(-1)!);
  expect((await api(`${verification.pathname}${verification.search}`)).status).toBeLessThan(400);
  const login = await api("/api/auth/sign-in/email", "POST", { email, password: "test-password-123" });
  expect(login.status).toBe(200);
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return { id: body.user.id as string, cookie };
}
async function room(cookie: string) {
  const response = await api("/rooms", "POST", { chapterId: chapters[0].id }, cookie);
  expect(response.status).toBe(200);
  return (await response.json()).roomId as string;
}
beforeEach(async () => {
  db = new RoomsDb(":memory:"); db.initializeSchema(); emails = [];
  services = { grade: vi.fn(async () => ({ rating: 4, comment: "Good answer." })), transcribe: vi.fn(async () => ({ value: "ephemeral-token", expires_at: 100 })) };
  application = createApplication({ roomsDb: db, config, sendEmail: async email => { emails.push(email); }, llm: services });
  server = createServer(application.app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); });

describe("accounts and permissions", () => {
  it("sets Secure, HttpOnly and SameSite=Lax on the production database-session cookie", async () => {
    await user();
    const productionAuth = createAuth(db.connection, { ...config, production: true, publicOrigin: "https://study.example" }, async () => {});
    const response = await productionAuth.api.signInEmail({ body: { email: "owner@example.com", password: "test-password-123" }, asResponse: true });
    const cookies = response.headers.getSetCookie();
    expect(cookies.join(";")).not.toContain("session_data");
    const sessionCookie = cookies.find(cookie => cookie.includes("session_token"));
    expect(sessionCookie).toMatch(/Secure/i);
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  it("rejects expired verification and reset links", async () => {
    const owner = await user();
    await api("/api/auth/request-password-reset", "POST", { email: "owner@example.com", redirectTo: `${origin}/reset-password` });
    const resetLink = new URL(emails.at(-1)!.text.split(" ").at(-1)!);
    const token = resetLink.pathname.split("/").at(-1);
    db.run("UPDATE verification SET expiresAt = 0");
    expect((await api("/api/auth/reset-password", "POST", { token, newPassword: "replacement-password-123" })).status).toBeGreaterThanOrEqual(400);
    expect((await api("/me", "GET", undefined, owner.cookie)).status).toBe(200);
    await api("/api/auth/sign-up/email", "POST", { email: "expired@example.com", password: "test-password-123" });
    const verifyLink = new URL(emails.at(-1)!.text.split(" ").at(-1)!);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
      const response = await api(`${verifyLink.pathname}${verifyLink.search}`);
      expect(response.status >= 400 || response.headers.get("location")?.includes("error")).toBeTruthy();
      expect(db.get<{ emailVerified: number }>('SELECT emailVerified FROM "user" WHERE email = ?', ["expired@example.com"])?.emailVerified).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("requires verification, stores no name, uses an HttpOnly session cookie, and signs out", async () => {
    const signup = await api("/api/auth/sign-up/email", "POST", { email: "new@example.com", password: "test-password-123" });
    expect(signup.status).toBe(200);
    const body = await signup.json();
    expect(body.user.name).toBe("");
    expect(body.user.image).toBeNull();
    expect(db.get('SELECT * FROM "user" WHERE id = ?', [body.user.id])).not.toHaveProperty("name");
    expect((await api("/api/auth/sign-in/email", "POST", { email: "new@example.com", password: "test-password-123" })).status).toBe(403);
    const signedIn = await user();
    expect(signedIn.cookie).toContain("session_token");
    expect(signedIn.cookie).not.toContain("session_data");
    expect((await api("/me", "GET", undefined, signedIn.cookie)).status).toBe(200);
    await api("/api/auth/sign-out", "POST", {}, signedIn.cookie);
    expect((await api("/me", "GET", undefined, signedIn.cookie)).status).toBe(401);
  });
  it("sends new verification links and rejects tampered verification tokens", async () => {
    await api("/api/auth/sign-up/email", "POST", { email: "new@example.com", password: "test-password-123" });
    const count = emails.length;
    expect((await api("/api/auth/send-verification-email", "POST", { email: "new@example.com" })).status).toBe(200);
    expect(emails.length).toBe(count + 1);
    const invalid = await api("/api/auth/verify-email?token=invalid");
    expect(invalid.status >= 400 || invalid.headers.get("location")?.includes("error")).toBeTruthy();
  });
  it("resets passwords and revokes old sessions", async () => {
    const owner = await user();
    await api("/api/auth/request-password-reset", "POST", { email: "owner@example.com", redirectTo: `${origin}/reset-password` });
    const link = new URL(emails.at(-1)!.text.split(" ").at(-1)!);
    const token = link.pathname.split("/").at(-1);
    const reset = await api("/api/auth/reset-password", "POST", { token, newPassword: "replacement-password-123" });
    expect(reset.status).toBe(200);
    expect((await api("/me", "GET", undefined, owner.cookie)).status).toBe(401);
    expect((await api("/api/auth/sign-in/email", "POST", { email: "owner@example.com", password: "replacement-password-123" })).status).toBe(200);
    expect((await api("/api/auth/reset-password", "POST", { token, newPassword: "another-password-123" })).status).toBeGreaterThanOrEqual(400);
  });
  it("starts Google and GitHub OAuth and rejects invalid callbacks", async () => {
    for (const provider of ["google", "github"]) {
      const response = await api("/api/auth/sign-in/social", "POST", { provider, callbackURL: `${origin}/profile` });
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.url).toContain(provider === "google" ? "accounts.google.com" : "github.com");
      expect(payload.url).toContain("state=");
      const callback = await api(`/api/auth/callback/${provider}?state=invalid&code=invalid`);
      expect(callback.status >= 400 || callback.headers.get("location")?.includes("error")).toBeTruthy();
    }
  });
  it("isolates room lists, ignores forged ownership, and restricts deletion", async () => {
    expect((await api("/rooms", "POST", { chapterId: chapters[0].id })).status).toBe(401);
    const owner = await user(); const other = await user("other@example.com");
    const created = await api("/rooms", "POST", { chapterId: chapters[0].id, ownerUserId: other.id }, owner.cookie);
    const id = (await created.json()).roomId;
    expect(db.getRoom(id)?.owner_user_id).toBe(owner.id);
    expect(await (await api("/me/rooms", "GET", undefined, other.cookie)).json()).toEqual([]);
    expect((await api(`/rooms/${id}`, "DELETE", undefined, other.cookie)).status).toBe(404);
    expect((await api(`/rooms/${id}`, "DELETE", undefined, owner.cookie)).status).toBe(204);
  });
  it("returns a name-free profile and rejects expired sessions and foreign origins", async () => {
    const owner = await user();
    const profile = await (await api("/me", "GET", undefined, owner.cookie)).json();
    expect(profile).toMatchObject({ id: owner.id, email: "owner@example.com" });
    expect(profile).not.toHaveProperty("name");
    expect(profile).not.toHaveProperty("image");
    expect((await api("/me", "PATCH", { name: "Other" }, owner.cookie, "https://evil.example")).status).toBe(403);
    db.run("UPDATE session SET expiresAt = 0 WHERE userId = ?", [owner.id]);
    expect((await api("/me", "GET", undefined, owner.cookie)).status).toBe(401);
  });
});

describe("room participation API", () => {
  it("automatically lists authored rooms and registers participants without a body", async () => {
    const owner = await user(); const participant = await user("participant@example.com");
    const id = await room(owner.cookie);
    const before = db.getRoom(id);
    const owned = await (await api("/me/rooms", "GET", undefined, owner.cookie)).json();
    expect(owned).toHaveLength(1);
    expect(owned[0]).toMatchObject({ roomId: id, isAuthor: true, joinedAt: owned[0].createdAt, lastOpenedAt: owned[0].createdAt });
    expect(await (await api(`/rooms/${id}/participants/me`, "POST", undefined, owner.cookie)).json()).toEqual({ participationCreated: false });
    const registrations = await Promise.all([1, 2].map(async () => {
      const response = await api(`/rooms/${id}/participants/me`, "POST", undefined, participant.cookie);
      expect(response.status).toBe(200);
      return (await response.json()).participationCreated;
    }));
    expect(registrations.sort()).toEqual([false, true]);
    const joined = await (await api("/me/rooms", "GET", undefined, participant.cookie)).json();
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ roomId: id, isAuthor: false, progress: owned[0].progress });
    expect(joined[0]).not.toHaveProperty("owner_user_id");
    expect(db.getRoom(id)).toEqual(before);
    expect((await api(`/rooms/${id}`, "DELETE", undefined, participant.cookie)).status).toBe(404);
    expect((await api(`/rooms/${id}`, "DELETE")).status).toBe(401);
    expect((await api(`/rooms/${id}`, "DELETE", undefined, owner.cookie)).status).toBe(204);
    expect(await (await api("/me/rooms", "GET", undefined, participant.cookie)).json()).toEqual([]);
    expect(db.all("SELECT * FROM room_participants WHERE room_id = ?", [id])).toEqual([]);
    expect((await api(`/rooms/${id}/participants/me`, "POST", undefined, participant.cookie)).status).toBe(404);
  });

  it("uses only the session and room ID, even when chapter content is unavailable", async () => {
    const owner = await user(); const participant = await user("participant@example.com");
    db.addRoom({ roomId: "unknown-chapter", chapterId: "not-in-catalog", ownerUserId: owner.id });
    expect((await api("/rooms/unknown-chapter/participants/me", "POST", {
      userId: owner.id, ownerUserId: participant.id, isAuthor: true, chapterId: "wrong", joinedAt: "forged",
    }, participant.cookie)).status).toBe(200);
    expect(db.listParticipatedRooms(participant.id)[0]).toMatchObject({ id: "unknown-chapter", owner_user_id: owner.id });
    expect(db.listParticipatedRooms(participant.id)[0].joined_at).not.toBe("forged");
    db.addRoom({ roomId: "legacy-room", chapterId: chapters[0].id });
    expect((await api("/rooms/legacy-room/participants/me", "POST", undefined, participant.cookie)).status).toBe(200);
    const rooms = await (await api("/me/rooms", "GET", undefined, participant.cookie)).json();
    expect(rooms.find((row: { roomId: string }) => row.roomId === "legacy-room")).toMatchObject({ isAuthor: false });
    expect((await api("/rooms/legacy-room", "DELETE", undefined, participant.cookie)).status).toBe(404);
  });

  it("rejects anonymous/expired sessions, foreign origins, and missing rooms without creating associations", async () => {
    const owner = await user(); const id = await room(owner.cookie);
    expect((await api(`/rooms/${id}/participants/me`, "POST")).status).toBe(401);
    expect((await api(`/rooms/${id}/participants/me`, "POST", undefined, owner.cookie, "https://evil.example")).status).toBe(403);
    expect((await api("/rooms/missing/participants/me", "POST", undefined, owner.cookie)).status).toBe(404);
    db.run("UPDATE session SET expiresAt = 0 WHERE userId = ?", [owner.id]);
    expect((await api(`/rooms/${id}/participants/me`, "POST", undefined, owner.cookie)).status).toBe(401);
    expect(db.all("SELECT * FROM room_participants")).toHaveLength(1);
  });

  it("recovers from concurrent ID collisions and reports busy errors separately", async () => {
    const first = await user(); const second = await user("second@example.com");
    const generate = vi.spyOn(db, "generateRoomId").mockReturnValueOnce("SAME01").mockReturnValueOnce("SAME01").mockReturnValue("NEXT02");
    const ids = await Promise.all([room(first.cookie), room(second.cookie)]);
    expect(new Set(ids).size).toBe(2);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(db.listParticipatedRooms(first.id).map(row => row.id)).toEqual([ids[0]]);
    expect(db.listParticipatedRooms(second.id).map(row => row.id)).toEqual([ids[1]]);
    const create = vi.spyOn(db, "createRoom").mockImplementation(() => { throw new Database.SqliteError("database is locked", "SQLITE_BUSY"); });
    try {
      const response = await api("/rooms", "POST", { chapterId: chapters[0].id }, first.cookie);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "DATABASE_BUSY" });
    } finally { create.mockRestore(); generate.mockRestore(); }
  });
});

describe("room owner credentials and progress", () => {
  it("lets guests grade and transcribe using the owner's key, never the initiator's", async () => {
    const owner = await user(); const guestAccount = await user("other@example.com");
    const id = await room(owner.cookie);
    await api("/me/llm-key", "PUT", { apiKey: ownerKey }, owner.cookie);
    await api("/me/llm-key", "PUT", { apiKey: "sk-participant-private-654321" }, guestAccount.cookie);
    await api("/api/auth/sign-out", "POST", {}, owner.cookie);
    const check = `/rooms/${id}/questions/theory-1/check`;
    expect((await api(check, "POST", { answer: "First answer", baseRevision: 0 })).status).toBe(200);
    expect((await api(check, "POST", { answer: "Better answer", baseRevision: 1 }, guestAccount.cookie)).status).toBe(200);
    expect(vi.mocked(services.grade).mock.calls.map(call => call[0])).toEqual([ownerKey, ownerKey]);
    expect(vi.mocked(services.grade).mock.calls[0][3]).toMatchObject({ userId: owner.id, metadata: { actor_id: "anonymous" } });
    expect(vi.mocked(services.grade).mock.calls[1][3]).toMatchObject({ userId: owner.id, metadata: { actor_id: guestAccount.id } });
    expect((await api("/realtime/transcription-token", "POST", { roomId: id, languages: ["en"] })).status).toBe(200);
    expect(services.transcribe).toHaveBeenCalledWith(ownerKey, ["en"], `${owner.id}:${id}`);
    const renewed = await api("/api/auth/sign-in/email", "POST", { email: "owner@example.com", password: "test-password-123" });
    const cookie = renewed.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    const summaries = await (await api("/me/rooms", "GET", undefined, cookie)).json();
    expect(summaries[0].progress).toMatchObject({ checked: 1, averageScore: 4, theory: { checked: 1 }, practice: { checked: 0 } });
    expect(summaries[0].continueQuestionRef).toBe("theory-2");
  });
  it("does not fall back for missing, removed or legacy keys, and broadcasts availability", async () => {
    const owner = await user(); const id = await room(owner.cookie);
    const broadcast = vi.spyOn(application.realtime, "broadcastRoomSnapshot");
    const check = () => api(`/rooms/${id}/questions/theory-1/check`, "POST", { answer: "Answer", baseRevision: 0 });
    expect((await check()).status).toBe(403);
    await api("/me/llm-key", "PUT", { apiKey: ownerKey }, owner.cookie);
    expect(broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ hasOwnerLlmKey: true }));
    await api("/me/llm-key", "DELETE", undefined, owner.cookie);
    expect(broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ hasOwnerLlmKey: false }));
    expect((await check()).status).toBe(403);
    db.addRoom({ roomId: "legacy", chapterId: chapters[0].id });
    expect(getRoomDetails("legacy", db).hasOwnerLlmKey).toBe(false);
    expect((await api("/realtime/transcription-token", "POST", { roomId: "legacy" })).status).toBe(403);
    expect((await api("/realtime/transcription-token", "POST", {})).status).toBe(400);
    expect(services.grade).not.toHaveBeenCalled();
    expect(services.transcribe).not.toHaveBeenCalled();
  });
  it("encrypts keys, returns only masked status, and detects tampering", async () => {
    const owner = await user();
    const saved = await (await api("/me/llm-key", "PUT", { apiKey: ownerKey }, owner.cookie)).json();
    expect(saved).toMatchObject({ configured: true, lastFour: "123456".slice(-4) });
    const stored = db.get<{ ciphertext: string }>("SELECT * FROM user_llm_credentials WHERE user_id = ?", [owner.id]);
    expect(JSON.stringify(stored)).not.toContain(ownerKey);
    expect(application.accounts.decryptKey(owner.id)).toBe(ownerKey);
    expect(JSON.stringify(await (await api("/me", "GET", undefined, owner.cookie)).json())).not.toContain(ownerKey);
    application.accounts.saveKey(owner.id, "sk-replacement-private-999999");
    expect(application.accounts.decryptKey(owner.id)).toBe("sk-replacement-private-999999");
    const other = await user("other@example.com");
    db.run("UPDATE user_llm_credentials SET user_id = ? WHERE user_id = ?", [other.id, owner.id]);
    expect(() => application.accounts.decryptKey(other.id)).toThrow("cannot be read");
    db.run("UPDATE user_llm_credentials SET user_id = ? WHERE user_id = ?", [owner.id, other.id]);
    db.run("UPDATE user_llm_credentials SET auth_tag = ? WHERE user_id = ?", [Buffer.alloc(16).toString("base64"), owner.id]);
    expect(() => application.accounts.decryptKey(owner.id)).toThrow("cannot be read");
  });
  it("rejects concurrent checks before charging and cannot restore a deleted room", async () => {
    const owner = await user(); const id = await room(owner.cookie); application.accounts.saveKey(owner.id, ownerKey);
    let finish!: (result: { rating: number; comment: string }) => void;
    let started!: () => void; const startedPromise = new Promise<void>(resolve => { started = resolve; });
    vi.mocked(services.grade).mockImplementationOnce(() => { started(); return new Promise(resolve => { finish = resolve; }); });
    const status = vi.spyOn(application.realtime, "setChecking");
    const path = `/rooms/${id}/questions/theory-1/check`;
    const first = api(path, "POST", { answer: "Answer", baseRevision: 0 }); await startedPromise;
    expect(status).toHaveBeenCalledWith(id, "theory-1", true);
    const duplicate = await api(path, "POST", { answer: "Answer", baseRevision: 0 });
    expect((await duplicate.json()).code).toBe("ALREADY_CHECKING");
    expect((await api(`/rooms/${id}/questions/theory-0/check`, "POST", { answer: "Zero", baseRevision: 0 })).status).toBe(404);
    const alias = await api(`/rooms/${id}/questions/theory-01/check`, "POST", { answer: "Alias", baseRevision: 0 });
    expect(alias.status).toBe(404);
    expect((await api(`/rooms/${id}/questions/theory-2/check`, "POST", { answer: "Independent question", baseRevision: 0 })).status).toBe(200);
    await api(`/rooms/${id}`, "DELETE", undefined, owner.cookie);
    finish({ rating: 4, comment: "Good" });
    expect((await first).status).toBe(404);
    expect(db.getRoom(id)).toBeUndefined();
    expect(status).toHaveBeenLastCalledWith(id, "theory-1", false);
    expect(services.grade).toHaveBeenCalledTimes(2);
  });
  it.each([[401, "invalid_api_key", "OWNER_KEY_INVALID"], [429, "insufficient_quota", "LLM_QUOTA_EXCEEDED"], [404, "model_not_found", "LLM_MODEL_UNAVAILABLE"], [500, "server_error", "LLM_UNAVAILABLE"]])("maps provider failure %s without exposing credentials", async (status, code, expectedCode) => {
    const owner = await user(); const id = await room(owner.cookie); application.accounts.saveKey(owner.id, ownerKey);
    vi.mocked(services.grade).mockRejectedValueOnce(new APIError(Number(status), { code: String(code), message: ownerKey }, ownerKey, new Headers()));
    const response = await api(`/rooms/${id}/questions/theory-1/check`, "POST", { answer: "Answer", baseRevision: 0 });
    const payload = await response.json();
    expect(payload.code).toBe(expectedCode); expect(JSON.stringify(payload)).not.toContain(ownerKey);
    expect(db.getRoom(id)?.theory_answers).toBe("[]");
    expect((await api(`/rooms/${id}/questions/theory-1/check`, "POST", { answer: "Answer", baseRevision: 0 })).status).toBe(200);
    expect((await api(`/rooms/${id}/questions/theory-1/check`, "POST", { answer: "Stale answer", baseRevision: 0 })).status).toBe(409);
    expect(services.grade).toHaveBeenCalledTimes(2);
  });
});
