import { MAX_ANSWER_LENGTH } from "@study-platform/shared";
import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import multer from "multer";
import { AuthenticationError } from "openai";
import { chapters, getChapterById } from "./chapters";
import { Tutor } from "./services/tutor";
import { systemPrompt } from "./prompts/system-prompt";
import { userPromptForTheory } from "./prompts/theory-user-prompt";
import { userPromptForPractice } from "./prompts/practice-user-prompt";
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

app.use(cors());
app.use(express.json());

function ensureAnswer(req: Request, res: Response): string | null {
  const answer = req.body?.answer;

  if (typeof answer !== "string") {
    res.status(400).json({ error: "Request body must include string field 'answer'." });
    return null;
  }

  if (answer.length > MAX_ANSWER_LENGTH) {
    res.status(400).json({ error: `Answer must not exceed ${MAX_ANSWER_LENGTH} characters.` });
    return null;
  }

  return answer;
}

function readParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function respondToOpenAiError(res: Response, error: unknown, fallbackMessage: string): void {
  // eslint-disable-next-line no-console
  console.error(error);
  if (error instanceof AuthenticationError) {
    res.status(503).json({ error: "OpenAI API key is missing or invalid. Set OPENAI_API_KEY on the server." });
    return;
  }
  res.status(500).json({ error: fallbackMessage });
}

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

app.get("/chapters/:chapterId", (req: Request, res: Response): void => {
  const chapterId = readParam(req.params.chapterId);
  if (!chapterId) {
    res.status(400).json({ error: "Invalid chapter id." });
    return;
  }

  const chapter = getChapterById(chapterId);
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found." });
    return;
  }

  res.json(chapter);
});

app.post("/chapters/:chapterId/questions/theory/:questionId/check", async (req: Request, res: Response): Promise<void> => {
  const answer = ensureAnswer(req, res);
  if (!answer) return;

  const chapterId = readParam(req.params.chapterId);
  const questionId = readParam(req.params.questionId);
  if (!chapterId || !questionId) {
    res.status(400).json({ error: "Invalid route params." });
    return;
  }

  const chapter = getChapterById(chapterId);
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found." });
    return;
  }

  const theoryIndex = Number.parseInt(questionId, 10);
  const theoryItem = chapter.theory[theoryIndex];
  if (!Number.isInteger(theoryIndex) || !theoryItem) {
    res.status(404).json({ error: "Theory question not found." });
    return;
  }

  try {
    const result = await tutor.evaluateTheoryAnswer({ theoryItem, prompt: userPromptForTheory(answer, theoryItem) });
    res.json(result);
  } catch (error: unknown) {
    respondToOpenAiError(res, error, "Failed to evaluate answer.");
  }
});

app.post(
  "/chapters/:chapterId/questions/practice/:questionId/check",
  async (req: Request, res: Response): Promise<void> => {
    const answer = ensureAnswer(req, res);
    if (!answer) return;

    const chapterId = readParam(req.params.chapterId);
    const questionId = readParam(req.params.questionId);
    if (!chapterId || !questionId) {
      res.status(400).json({ error: "Invalid route params." });
      return;
    }

    const chapter = getChapterById(chapterId);
    if (!chapter) {
      res.status(404).json({ error: "Chapter not found." });
      return;
    }

    const practiceIndex = Number.parseInt(questionId, 10);
    const practiceItem = chapter.practice[practiceIndex];
    if (!Number.isInteger(practiceIndex) || !practiceItem) {
      res.status(404).json({ error: "Practice task not found." });
      return;
    }

    try {
      const result = await tutor.evaluatePracticeAnswer({
        practiceItem,
        prompt: userPromptForPractice(answer, practiceItem),
      });

      res.json(result);
    } catch (error: unknown) {
      respondToOpenAiError(res, error, "Failed to evaluate answer.");
    }
  },
);

app.post("/transcribe", upload.single("audio"), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Request must include an audio file in 'audio' field." });
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // eslint-disable-next-line no-console
  console.log(
    `[Transcribe:${requestId}] Incoming audio (mime=${req.file.mimetype}, size=${req.file.size}, language=${typeof req.body?.language === "string" ? req.body.language : "unknown"})`,
  );

  try {
    const durationSeconds = await assertMaxRecordingDuration(req.file.buffer, req.file.mimetype);
    // eslint-disable-next-line no-console
    console.log(`[Transcribe:${requestId}] Duration ${durationSeconds.toFixed(1)}s`);

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
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof AuthenticationError) {
      res.status(503).json({ error: "OpenAI API key is missing or invalid. Set OPENAI_API_KEY on the server." });
      return;
    }
    res.status(500).json({ error: "Failed to transcribe audio." });
  }
});

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend server running on http://${HOST}:${PORT}`);
});
