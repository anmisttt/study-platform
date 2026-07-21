import cors, { type CorsOptions } from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { createServer } from "node:http";
import multer from "multer";
import { roomDraftsWebSocketPath } from "@study-platform/shared";
import { chapters, getChapterById } from "./chapters";
import { DraftRelay } from "./drafts/draftRelay";
import { assertRoomChapter, getRoomDetails } from "./db/roomContext";
import { RoomsDb } from "./db/roomsDb";
import { ConflictError, NotFoundError, UserError } from "./errors";
import { resolveChapter } from "./http/chapterContext";
import { readParam, readQueryParam } from "./http/params";
import { resolveChapterQuestion } from "./http/resolveChapterQuestion";
import { respondWithError } from "./http/respondWithError";
import { ensureAnswer, ensureBaseRevision } from "./http/validation";
import { Tutor } from "./services/tutor";
import { systemPrompt } from "./prompts/system-prompt";
import { userPromptForItem } from "./prompts/user-prompt";
import { assertMaxRecordingDuration, AudioDurationError } from "./services/audioDuration";
import { Transcriber } from "./services/transcriber";

dotenv.config();

const tutor = new Tutor({ systemPrompt, model: "gpt-5.5", apiKey: process.env.OPENAI_API_KEY ?? "", temperature: 1});
const transcriber = new Transcriber({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
});

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST ?? "127.0.0.1";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // enough for 13 minutes audio
});
const roomsDb = new RoomsDb();

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://study-platform.me",
];
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsAllowlist = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ALLOWED_ORIGINS;
const allowAllOrigins = corsAllowlist.includes("*");

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow non-browser clients (no Origin header) and same-origin requests.
    if (!origin || allowAllOrigins || corsAllowlist.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/chapters", (_req: Request, res: Response) => {
  const payload = chapters.map((chapter) => ({
    id: chapter.id,
    number: chapter.number,
    name: chapter.name,
    theoryCount: chapter.theory.length,
    practiceCount: chapter.practice.length,
  }));

  res.json(payload);
});

app.get("/rooms/:roomId", (req: Request, res: Response): void => {
  try {
    const room = getRoomDetails(readParam(req.params.roomId), roomsDb);
    assertRoomChapter(room, readQueryParam(req.query.chapterId));
    res.json(room);
  } catch (error: unknown) {
    respondWithError(res, error);
  }
});

app.post("/rooms/:roomId/questions/:questionId/check", async (req: Request, res: Response): Promise<void> => {
  const roomId = readParam(req.params.roomId);

  try {
    const answer = ensureAnswer(req.body?.answer);
    const baseRevision = ensureBaseRevision(req.body?.baseRevision);
    const room = getRoomDetails(roomId, roomsDb);
    const questionId = readParam(req.params.questionId);
    if (!questionId) {
      throw new NotFoundError("Question not found.");
    }

    const chapter = getChapterById(room.chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found for room.");
    }

    const resolved = resolveChapterQuestion(chapter, questionId);
    if (!resolved) {
      throw new NotFoundError("Question not found.");
    }

    const result = await tutor.evaluateAnswer(userPromptForItem(answer, resolved.item));

    const revision = roomsDb.updateAnswer({
      roomId: room.roomId,
      type: resolved.type,
      questionIndex: resolved.index,
      user_answer: answer,
      rating: result.rating,
      comment: result.comment,
      baseRevision,
    });

    res.json({ ...result, revision });
  } catch (error: unknown) {
    respondWithError(res, error, "Failed to evaluate answer.", {
      room: error instanceof ConflictError ? getRoomDetails(roomId, roomsDb) : undefined,
    });
  }
});

app.post("/transcribe", upload.single("audio"), async (req: Request, res: Response): Promise<void> => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (!req.file) {
      throw new UserError("Request must include an audio file in 'audio' field.");
    }

    // eslint-disable-next-line no-console
    console.log(
      `[Transcribe:${requestId}] Incoming audio (mime=${req.file.mimetype}, size=${req.file.size}, language=${typeof req.body?.language === "string" ? req.body.language : "unknown"})`,
    );

    const durationSeconds = await assertMaxRecordingDuration(req.file.buffer, req.file.mimetype);
    // eslint-disable-next-line no-console
    console.log(
      `[Transcribe:${requestId}] Duration ${durationSeconds !== null ? `${durationSeconds.toFixed(1)}s` : "unknown"}`,
    );

    const text = await transcriber.transcribeAudio({
      audioBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      language: typeof req.body?.language === "string" ? req.body.language : undefined,
    });
    // eslint-disable-next-line no-console
    console.log(`[Transcribe:${requestId}] Success (textLength=${text.length})`);
    res.json({ text });
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[Transcribe:${requestId}] Failed`, error);
    if (error instanceof AudioDurationError) {
      respondWithError(res, new UserError(error.message));
      return;
    }
    respondWithError(res, error, "Failed to transcribe audio.");
  }
});

app.post("/rooms", (req: Request, res: Response): void => {
  try {
    const { chapter } = resolveChapter(readParam(req.body.chapterId));
    const roomId = roomsDb.generateUniqueRoomId();

    roomsDb.addRoom({ roomId, chapterId: chapter.id });

    res.json({ roomId });
  } catch (error: unknown) {
    respondWithError(res, error);
  }
});

const draftRelay = new DraftRelay();
const httpServer = createServer(app);
draftRelay.attach(httpServer, roomDraftsWebSocketPath());

httpServer.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend server running on http://${HOST}:${PORT}`);
});
