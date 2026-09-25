import type { Response } from "express";
import Database from "better-sqlite3";
import type { RoomDetails } from "@study-platform/shared";
import { APIError, APIConnectionError, APIConnectionTimeoutError } from "openai";
import { ConflictError, HttpError, isHttpError } from "../errors.js";

export function respondWithError(res: Response, error: unknown, fallbackMessage = "Internal server error.", options?: { room?: RoomDetails }): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
  } else if (error instanceof Database.SqliteError && error.code.startsWith("SQLITE_BUSY")) {
    res.status(503).json({ error: "The database is busy. Please try again.", code: "DATABASE_BUSY" });
  } else if (error instanceof ConflictError) {
    res.status(409).json({ error: error.message, code: "REVISION_CONFLICT", ...(options?.room ? { room: options.room } : {}) });
  } else if (isHttpError(error)) {
    res.status(error.statusCode).json({ error: error.message, code: error.statusCode === 404 ? "NOT_FOUND" : "INVALID_REQUEST" });
  } else if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    res.status(503).json({ code: "LLM_UNAVAILABLE", error: "OpenAI could not be reached. Please try again." });
  } else if (error instanceof APIError) {
    const quota = error.code === "insufficient_quota";
    const invalid = error.status === 401;
    const model = error.status === 403 || error.status === 404 || error.code === "model_not_found";
    res.status(invalid || model ? 422 : 503).json({
      code: invalid ? "OWNER_KEY_INVALID" : quota ? "LLM_QUOTA_EXCEEDED" : model ? "LLM_MODEL_UNAVAILABLE" : error.status === 429 ? "LLM_RATE_LIMITED" : "LLM_UNAVAILABLE",
      error: invalid ? "The room owner's OpenAI key is invalid. Ask them to replace it."
        : quota ? "The room owner's OpenAI account has insufficient quota."
        : model ? "The room owner's OpenAI key cannot access the required model."
        : "OpenAI is temporarily unavailable. Please try again.",
    });
  } else {
    // Provider SDK errors may embed Authorization headers. Do not serialize them.
    console.error("Request failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    res.status(500).json({ error: fallbackMessage, code: "INTERNAL_ERROR" });
  }
}
