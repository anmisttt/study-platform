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
import { getRoomSummary } from "./db/roomContext.js";

const origin = "http://localhost:5173";
const ownerKey = "sk-owner-private-key-123456";
const checkPath = (roomId: string, questionRef: string, chapterId = chapters[0].id) =>
  `/rooms/${roomId}/chapters/${chapterId}/questions/${questionRef}/check`;
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
  const response = await api("/rooms", "POST", undefined, cookie);
  expect(response.status).toBe(200);
  return (await response.json()).roomId as string;
}
async function expectAnonymousProfile(cookie = "") {
  const response = await api("/me", "GET", undefined, cookie);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toBeNull();
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
  it("allows anonymous session checks but requires sign-in to create rooms or access private account data", async () => {
    await expectAnonymousProfile();
    await expectAnonymousProfile("better-auth.session_token=invalid");
    const created = await api("/rooms", "POST");
    expect(created.status).toBe(401);
    expect(await created.json()).toEqual({ code: "AUTH_REQUIRED", error: "Please sign in to continue." });
    expect(db.all("SELECT * FROM rooms")).toEqual([]);
    expect((await api("/me/rooms")).status).toBe(401);
    expect((await api("/me/llm-key", "PUT", { apiKey: ownerKey })).status).toBe(401);
  });

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
    await expectAnonymousProfile(signedIn.cookie);
    expect((await api("/rooms", "POST", undefined, signedIn.cookie)).status).toBe(401);
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
    await expectAnonymousProfile(owner.cookie);
    expect((await api("/rooms", "POST", undefined, owner.cookie)).status).toBe(401);
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
    expect((await api("/rooms", "POST")).status).toBe(401);
    const owner = await user(); const other = await user("other@example.com");
    const created = await api("/rooms", "POST", { ownerUserId: other.id }, owner.cookie);
    const id = (await created.json()).roomId;
    expect(db.getRoom(id)?.owner_user_id).toBe(owner.id);
    expect(await (await api("/me/rooms", "GET", undefined, other.cookie)).json()).toEqual([]);
    expect((await api(`/rooms/${id}`, "DELETE", undefined, other.cookie)).status).toBe(404);
    expect((await api(`/rooms/${id}`, "DELETE", undefined, owner.cookie)).status).toBe(204);
  });
  it("returns a name-free profile, treats expired sessions as anonymous, and rejects foreign origins", async () => {
    const owner = await user();
    const profile = await (await api("/me", "GET", undefined, owner.cookie)).json();
    expect(profile).toMatchObject({ id: owner.id, email: "owner@example.com" });
    expect(profile).not.toHaveProperty("name");
    expect(profile).not.toHaveProperty("image");
    expect((await api("/me", "PATCH", { name: "Other" }, owner.cookie, "https://evil.example")).status).toBe(403);
    db.run("UPDATE session SET expiresAt = 0 WHERE userId = ?", [owner.id]);
    await expectAnonymousProfile(owner.cookie);
    expect((await api("/rooms", "POST", undefined, owner.cookie)).status).toBe(401);
  });
});

describe("chapter details API", () => {
  it("returns chapter tasks with reference answers to anonymous users without a room", async () => {
    const response = await api(`/chapters/${encodeURIComponent(chapters[0].id)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("etag")).toBeTruthy();
    const body = await response.json();
    expect(body).toEqual(JSON.parse(JSON.stringify(chapters[0])));
    expect(body.theory).toHaveLength(chapters[0].theory.length);
    expect(body.practice).toHaveLength(chapters[0].practice.length);
    for (const item of [...body.theory, ...body.practice]) {
      expect(item.answer).toEqual(expect.any(String));
      expect(item).not.toHaveProperty("user_answer");
      expect(item).not.toHaveProperty("rating");
    }
    expect(db.all("SELECT * FROM rooms")).toEqual([]);
    const missing = await api("/chapters/missing-chapter");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
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
    expect(joined[0]).toMatchObject({ roomId: id, isAuthor: false, chapters: [], activeChapterId: null, roomProgress: owned[0].roomProgress });
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
    db.addRoom({ roomId: "unknown-chapter", ownerUserId: owner.id });
    expect((await api("/rooms/unknown-chapter/participants/me", "POST", {
      userId: owner.id, ownerUserId: participant.id, isAuthor: true, chapterId: "wrong", joinedAt: "forged",
    }, participant.cookie)).status).toBe(200);
    expect(db.listParticipatedRooms(participant.id)[0]).toMatchObject({ id: "unknown-chapter", owner_user_id: owner.id });
    expect(db.listParticipatedRooms(participant.id)[0].joined_at).not.toBe("forged");
    db.addRoom({ roomId: "legacy-room" });
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
      const response = await api("/rooms", "POST", undefined, first.cookie);
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
    const check = checkPath(id, "theory-1");
    const broadcast = vi.spyOn(application.realtime, "broadcastChapterAnswers");
    expect((await api(check, "POST", { answer: "First answer", baseRevision: 0 })).status).toBe(200);
    expect((await api(check, "POST", { answer: "Better answer", baseRevision: 1 }, guestAccount.cookie)).status).toBe(200);
    expect(db.all("SELECT chapter_id, question_type, question_index, user_answer, revision FROM answers WHERE room_id = ?", [id])).toEqual([
      { chapter_id: chapters[0].id, question_type: "theory", question_index: 0, user_answer: "Better answer", revision: 2 },
    ]);
    expect(broadcast.mock.lastCall?.[0]).toMatchObject({ roomId: id, chapterId: chapters[0].id });
    expect(broadcast.mock.lastCall?.[0].theory[0]).toMatchObject({ user_answer: "Better answer", revision: 2 });
    expect(vi.mocked(services.grade).mock.calls.map(call => call[0])).toEqual([ownerKey, ownerKey]);
    expect(vi.mocked(services.grade).mock.calls[0][3]).toMatchObject({
      userId: owner.id,
      metadata: {
        chapterId: "first_chapter",
        questionId: "theory-1",
        actorId: "anonymous",
      },
    });
    expect(vi.mocked(services.grade).mock.calls[1][3]).toMatchObject({
      userId: owner.id,
      metadata: {
        chapterId: "first_chapter",
        questionId: "theory-1",
        actorId: guestAccount.id,
      },
    });
    expect((await api("/realtime/transcription-token", "POST", { roomId: id, languages: ["en"] })).status).toBe(200);
    expect(services.transcribe).toHaveBeenCalledWith(ownerKey, ["en"], `${owner.id}:${id}`);
    const renewed = await api("/api/auth/sign-in/email", "POST", { email: "owner@example.com", password: "test-password-123" });
    const cookie = renewed.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    const summaries = await (await api("/me/rooms", "GET", undefined, cookie)).json();
    expect(summaries[0].activeChapterId).toBe(chapters[0].id);
    expect(summaries[0].chapters[0].progress).toMatchObject({ checked: 1, averageScore: 4, theory: { checked: 1 }, practice: { checked: 0 } });
    expect(summaries[0].continue).toEqual({ chapterNumber: chapters[0].number, questionRef: "theory-2" });
  });
  it("does not fall back for missing, removed or legacy keys, and broadcasts availability", async () => {
    const owner = await user(); const id = await room(owner.cookie);
    const broadcast = vi.spyOn(application.realtime, "broadcastRoomSummary");
    const check = () => api(checkPath(id, "theory-1"), "POST", { answer: "Answer", baseRevision: 0 });
    expect((await check()).status).toBe(403);
    await api("/me/llm-key", "PUT", { apiKey: ownerKey }, owner.cookie);
    expect(broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ hasOwnerLlmKey: true }));
    await api("/me/llm-key", "DELETE", undefined, owner.cookie);
    expect(broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ hasOwnerLlmKey: false }));
    expect((await check()).status).toBe(403);
    db.addRoom({ roomId: "legacy" });
    expect(getRoomSummary("legacy", db).hasOwnerLlmKey).toBe(false);
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
    const path = checkPath(id, "theory-1");
    const first = api(path, "POST", { answer: "Answer", baseRevision: 0 }); await startedPromise;
    expect(status).toHaveBeenCalledWith(id, chapters[0].id, "theory-1", true);
    const duplicate = await api(path, "POST", { answer: "Answer", baseRevision: 0 });
    expect((await duplicate.json()).code).toBe("ALREADY_CHECKING");
    expect((await api(checkPath(id, "theory-0"), "POST", { answer: "Zero", baseRevision: 0 })).status).toBe(404);
    const alias = await api(checkPath(id, "theory-01"), "POST", { answer: "Alias", baseRevision: 0 });
    expect(alias.status).toBe(404);
    expect((await api(checkPath(id, "theory-2"), "POST", { answer: "Independent question", baseRevision: 0 })).status).toBe(200);
    await api(`/rooms/${id}`, "DELETE", undefined, owner.cookie);
    finish({ rating: 4, comment: "Good" });
    expect((await first).status).toBe(404);
    expect(db.getRoom(id)).toBeUndefined();
    expect(status).toHaveBeenLastCalledWith(id, chapters[0].id, "theory-1", false);
    expect(services.grade).toHaveBeenCalledTimes(2);
  });
  it.each([[401, "invalid_api_key", "OWNER_KEY_INVALID"], [429, "insufficient_quota", "LLM_QUOTA_EXCEEDED"], [404, "model_not_found", "LLM_MODEL_UNAVAILABLE"], [500, "server_error", "LLM_UNAVAILABLE"]])("maps provider failure %s without exposing credentials", async (status, code, expectedCode) => {
    const owner = await user(); const id = await room(owner.cookie); application.accounts.saveKey(owner.id, ownerKey);
    vi.mocked(services.grade).mockRejectedValueOnce(new APIError(Number(status), { code: String(code), message: ownerKey }, ownerKey, new Headers()));
    const response = await api(checkPath(id, "theory-1"), "POST", { answer: "Answer", baseRevision: 0 });
    const payload = await response.json();
    expect(payload.code).toBe(expectedCode); expect(JSON.stringify(payload)).not.toContain(ownerKey);
    expect(db.getChapterAnswers(id, chapters[0].id).theory).toEqual([]);
    expect((await api(checkPath(id, "theory-1"), "POST", { answer: "Answer", baseRevision: 0 })).status).toBe(200);
    expect((await api(checkPath(id, "theory-1"), "POST", { answer: "Stale answer", baseRevision: 0 })).status).toBe(409);
    expect(services.grade).toHaveBeenCalledTimes(2);
  });
});

describe("multi-chapter rooms", () => {
  it("creates an empty room without a chapter", async () => {
    const owner = await user();
    const id = await room(owner.cookie);
    expect(db.getRoom(id)).not.toHaveProperty("chapter_id");
    expect(db.all("SELECT * FROM answers")).toEqual([]);
    const [summary] = await (await api("/me/rooms", "GET", undefined, owner.cookie)).json();
    expect(summary).toMatchObject({
      roomId: id, isAuthor: true, chapters: [], activeChapterId: null,
      roomProgress: { checked: 0, total: 0, averageScore: null },
      continue: { chapterNumber: chapters[0].number, questionRef: "theory-1" },
    });
  });

  it("stores answers per chapter and scopes conflicts and broadcasts to the chapter", async () => {
    const owner = await user(); const id = await room(owner.cookie); application.accounts.saveKey(owner.id, ownerKey);
    const [first, second] = [chapters[0], chapters[1]];
    const answersBroadcast = vi.spyOn(application.realtime, "broadcastChapterAnswers");
    const summaryBroadcast = vi.spyOn(application.realtime, "broadcastRoomSummary");
    expect((await api(checkPath(id, "theory-1", second.id), "POST", { answer: "Second", baseRevision: 0 })).status).toBe(200);
    expect((await api(checkPath(id, "theory-1", first.id), "POST", { answer: "First", baseRevision: 0 })).status).toBe(200);
    expect(db.getChapterAnswers(id, first.id).theory[0]).toMatchObject({ user_answer: "First", revision: 1 });
    expect(db.getChapterAnswers(id, second.id).theory[0]).toMatchObject({ user_answer: "Second", revision: 1 });
    expect(answersBroadcast.mock.lastCall?.[0]).toMatchObject({ roomId: id, chapterId: first.id });
    expect(summaryBroadcast.mock.lastCall?.[0].chapters.map((chapter: { chapterId: string }) => chapter.chapterId)).toEqual([first.id, second.id]);

    const conflict = await api(checkPath(id, "theory-1", second.id), "POST", { answer: "Stale", baseRevision: 0 });
    expect(conflict.status).toBe(409);
    const payload = await conflict.json();
    expect(payload.answers).toMatchObject({ roomId: id, chapterId: second.id });
    expect(payload.answers.theory[0]).toMatchObject({ user_answer: "Second", revision: 1 });

    expect((await api(checkPath(id, "theory-1", "missing-chapter"), "POST", { answer: "A", baseRevision: 0 })).status).toBe(404);
    expect((await api(checkPath("missing", "theory-1"), "POST", { answer: "A", baseRevision: 0 })).status).toBe(404);
  });

  it("summarizes rooms with ascending chapters, starting at the first chapter with unsolved tasks", async () => {
    const owner = await user(); const id = await room(owner.cookie); application.accounts.saveKey(owner.id, ownerKey);
    const [first, second] = [chapters[0], chapters[1]];
    vi.mocked(services.grade).mockResolvedValueOnce({ rating: 5, comment: "" }).mockResolvedValueOnce({ rating: 3, comment: "" });
    await api(checkPath(id, "theory-1", first.id), "POST", { answer: "A", baseRevision: 0 });
    await api(checkPath(id, "practice-1", second.id), "POST", { answer: "B", baseRevision: 0 });
    const [summary] = await (await api("/me/rooms", "GET", undefined, owner.cookie)).json();
    expect(summary.chapters).toMatchObject([
      { chapterId: first.id, number: first.number, name: first.name, checked: 1, total: first.theory.length + first.practice.length,
        progress: { checked: 1, theory: { checked: 1 }, averageScore: 5 }, nextQuestionRef: "theory-2" },
      { chapterId: second.id, number: second.number, name: second.name, checked: 1, total: second.theory.length + second.practice.length,
        progress: { checked: 1, practice: { checked: 1 }, averageScore: 3 }, nextQuestionRef: "theory-1" },
    ]);
    expect(summary.activeChapterId).toBe(first.id);
    expect(summary.roomProgress).toEqual({
      checked: 2,
      total: first.theory.length + first.practice.length + second.theory.length + second.practice.length,
      averageScore: 4,
    });
    expect(summary.continue).toEqual({ chapterNumber: first.number, questionRef: "theory-2" });
  });
});
