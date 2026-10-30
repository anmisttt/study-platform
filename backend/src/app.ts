import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { formatQuestionRef, realtimeTranscriptionTokenPath, type CheckResult, type QuestionType } from "@study-platform/shared";
import { chapters, getChapterById } from "./chapters.js";
import { createAuth, type SendEmail } from "./auth.js";
import type { AppConfig } from "./config.js";
import { RoomsWebSocketServer } from "./roomsWebSocketServer.js";
import { getRoomChapterAnswers, getRoomSummary } from "./db/roomContext.js";
import { RoomsDb } from "./db/roomsDb.js";
import type { CheckedAnswerRow } from "./db/typings.js";
import { Accounts } from "./db/accounts.js";
import { profileRoomSummary } from "./db/progress.js";
import { ConflictError, HttpError, NotFoundError } from "./errors.js";
import { resolveChapter } from "./httpHelpers/chapterContext.js";
import { readParam } from "./httpHelpers/params.js";
import { resolveChapterQuestion } from "./httpHelpers/resolveChapterQuestion.js";
import { respondWithError } from "./httpHelpers/respondWithError.js";
import { ensureAnswer, ensureBaseRevision } from "./httpHelpers/validation.js";
import { Tutor, type TutorTraceContext } from "./services/tutor.js";
import { loadSystemPrompt } from "./prompts/loadSystemPrompt.js";
import { tutorEvaluationRequestForItem, type TutorEvaluationRequest } from "./prompts/user-prompt.js";
import { Transcriber, type TranscriptionClientSecret } from "./services/transcriber.js";

export type LlmServices = {
  grade: (apiKey: string, type: QuestionType, request: TutorEvaluationRequest, trace: TutorTraceContext) => Promise<CheckResult>;
  transcribe: (apiKey: string, languages: string[], safetyIdentifier: string) => Promise<TranscriptionClientSecret>;
};
const defaultLlm: LlmServices = {
  grade: async (apiKey, type, request, trace) => new Tutor({
    apiKey, systemPrompt: await loadSystemPrompt(type), model: "gpt-5.5", temperature: 1,
  }).evaluateAnswer(request, trace),
  transcribe: (apiKey, languages, safetyIdentifier) => new Transcriber({ apiKey }).createTranscriptionClientSecret({ languages, safetyIdentifier }),
};

export function createApplication({ roomsDb, config, sendEmail, llm = defaultLlm }: {
  roomsDb: RoomsDb; config: AppConfig; sendEmail?: SendEmail; llm?: LlmServices;
}) {
  const app = express();
  const auth = createAuth(roomsDb.connection, config, sendEmail);
  const accounts = new Accounts(roomsDb.connection, config.encryptionSecret);
  const realtime = new RoomsWebSocketServer({
    loadSummary: id => getRoomSummary(id, roomsDb),
    loadChapterAnswers: (id, chapterId) => getRoomChapterAnswers(id, chapterId, roomsDb),
    hasQuestion: (chapterId, questionId) => {
      const chapter = getChapterById(chapterId);
      return Boolean(chapter && resolveChapterQuestion(chapter, questionId));
    },
  }, config.trustedOrigins);
  const inFlight = new Set<string>();
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
  app.use(cors({ origin: config.trustedOrigins, credentials: true }));
  app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.all("/api/auth/{*splat}", toNodeHandler(auth));
  app.use(express.json({ limit: "32kb" }));
  app.use((req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && (!req.headers.origin || !config.trustedOrigins.includes(req.headers.origin))) {
      next(new HttpError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed."));
      return;
    }
    next();
  });
  const session = (req: Request) => auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  async function requireUser(req: Request) {
    const current = await session(req);
    if (!current) throw new HttpError(401, "AUTH_REQUIRED", "Please sign in to continue.");
    return current.user;
  }
  function ownerKey(roomId: string) {
    const room = roomsDb.getRoom(roomId);
    if (!room) throw new NotFoundError("Room not found.");
    if (!room.owner_user_id) throw new HttpError(403, "OWNER_KEY_MISSING", "This legacy room has no owner. Sign in and create a new room to use AI features.");
    return { ownerId: room.owner_user_id, apiKey: accounts.decryptKey(room.owner_user_id) };
  }
  function broadcastOwnedRooms(userId: string) {
    for (const room of roomsDb.listOwnedRooms(userId)) realtime.broadcastRoomSummary(getRoomSummary(room.id, roomsDb));
  }
  app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
  app.get("/auth-options", (_req, res) => { res.json({ google: Boolean(config.google), github: Boolean(config.github), email: Boolean(config.smtp || sendEmail) }); });
  app.get("/chapters", (_req, res) => {
    res.json(chapters.map(chapter => ({ id: chapter.id, number: chapter.number, name: chapter.name, theoryCount: chapter.theory.length, practiceCount: chapter.practice.length })));
  });
  app.get("/chapters/:chapterId", (req, res) => {
    const { chapter } = resolveChapter(readParam(req.params.chapterId));
    // Revalidated on every load (a cheap 304 via ETag) so content updates show on reload.
    res.setHeader("Cache-Control", "no-cache");
    res.json(chapter);
  });
  app.get("/me", async (req, res) => {
    const current = await session(req);
    res.json(current ? accounts.profile(current.user.id) : null);
  });
  app.put("/me/llm-key", async (req, res) => {
    const user = await requireUser(req);
    accounts.saveKey(user.id, req.body?.apiKey);
    broadcastOwnedRooms(user.id);
    res.json(accounts.keyStatus(user.id));
  });
  app.delete("/me/llm-key", async (req, res) => {
    const user = await requireUser(req);
    accounts.removeKey(user.id);
    broadcastOwnedRooms(user.id);
    res.json(accounts.keyStatus(user.id));
  });
  app.get("/me/rooms", async (req, res) => {
    const user = await requireUser(req);
    const answers = new Map<string, CheckedAnswerRow[]>();
    for (const answer of roomsDb.listParticipatedCheckedAnswers(user.id)) {
      const roomAnswers = answers.get(answer.room_id);
      if (roomAnswers) roomAnswers.push(answer);
      else answers.set(answer.room_id, [answer]);
    }
    res.json(roomsDb.listParticipatedRooms(user.id).map(room => profileRoomSummary(room, answers.get(room.id) ?? [], user.id)));
  });
  app.post("/rooms", async (req, res) => {
    const user = await requireUser(req);
    const roomId = roomsDb.createRoom({ ownerUserId: user.id });
    res.json({ roomId });
  });
  app.post("/rooms/:roomId/participants/me", async (req, res) => {
    const user = await requireUser(req);
    res.json(roomsDb.recordParticipation(readParam(req.params.roomId) ?? "", user.id));
  });
  app.delete("/rooms/:roomId", async (req, res) => {
    const user = await requireUser(req);
    const roomId = readParam(req.params.roomId) ?? "";
    if (!roomsDb.deleteOwnedRoom(roomId, user.id)) throw new NotFoundError("Room not found or you are not its creator.");
    realtime.removeRoom(roomId);
    res.status(204).end();
  });
  app.post("/rooms/:roomId/chapters/:chapterId/questions/:questionId/check", async (req, res) => {
    const roomId = readParam(req.params.roomId) ?? "";
    const chapterId = readParam(req.params.chapterId) ?? "";
    let questionId = readParam(req.params.questionId) ?? "";
    let key = "";
    let acquired = false;
    try {
      const answer = ensureAnswer(req.body?.answer);
      const baseRevision = ensureBaseRevision(req.body?.baseRevision);
      if (!roomsDb.getRoom(roomId)) throw new NotFoundError("Room not found.");
      const chapter = getChapterById(chapterId);
      const resolved = chapter && resolveChapterQuestion(chapter, questionId);
      if (!resolved || !chapter) throw new NotFoundError("Question not found.");
      questionId = formatQuestionRef(resolved.type, resolved.index);
      key = `${roomId}:${chapterId}:${questionId}`;
      const actor = await session(req);
      const { ownerId, apiKey } = ownerKey(roomId);
      roomsDb.assertAnswerRevision(roomId, chapter.id, resolved.type, resolved.index, baseRevision);
      if (inFlight.has(key)) throw new HttpError(409, "ALREADY_CHECKING", "This question is already being checked.");
      inFlight.add(key);
      acquired = true;
      realtime.setChecking(roomId, chapterId, questionId, true);
      const result = await llm.grade(apiKey, resolved.type, tutorEvaluationRequestForItem(answer, resolved.item), {
        userId: ownerId, sessionId: roomId,
        metadata: {
          chapterId: chapter.id,
          questionId: questionId,
          actorId: actor?.user.id ?? "anonymous",
        },
      });
      if (!Number.isFinite(result.rating) || result.rating < 1 || result.rating > 5 || typeof result.comment !== "string") throw new HttpError(502, "LLM_INVALID_RESULT", "OpenAI returned an invalid grade. Please try again.");
      const revision = roomsDb.updateAnswer({ roomId, chapterId: chapter.id, type: resolved.type, questionIndex: resolved.index, user_answer: answer, rating: result.rating, comment: result.comment, baseRevision });
      realtime.broadcastChapterAnswers(getRoomChapterAnswers(roomId, chapterId, roomsDb));
      realtime.broadcastRoomSummary(getRoomSummary(roomId, roomsDb));
      res.json({ ...result, revision });
    } catch (error) {
      respondWithError(res, error, "Failed to evaluate answer.", {
        answers: error instanceof ConflictError && roomsDb.getRoom(roomId) ? getRoomChapterAnswers(roomId, chapterId, roomsDb) : undefined,
      });
    } finally {
      if (acquired) { inFlight.delete(key); realtime.setChecking(roomId, chapterId, questionId, false); }
    }
  });
  app.post(realtimeTranscriptionTokenPath(), async (req, res) => {
    const roomId = readParam(req.body?.roomId);
    if (!roomId) throw new HttpError(400, "ROOM_REQUIRED", "A room is required for voice input.");
    const { ownerId, apiKey } = ownerKey(roomId);
    const languages = Array.isArray(req.body?.languages) ? req.body.languages.filter((v: unknown): v is string => typeof v === "string").slice(0, 5) : [];
    res.json(await llm.transcribe(apiKey, languages, `${ownerId}:${roomId}`));
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { if (res.headersSent) { _next(error); return; } respondWithError(res, error); });
  return { app, auth, accounts, realtime };
}
