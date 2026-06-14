import type { Response } from "express";
import type { RoomDetails } from "@study-platform/shared";
import { AuthenticationError } from "openai";
import { ConflictError, isHttpError } from "../errors";

type ErrorResponseOptions = {
  room?: RoomDetails;
};

export function respondWithError(
  res: Response,
  error: unknown,
  fallbackMessage = "Internal server error.",
  options?: ErrorResponseOptions,
): void {
  if (error instanceof ConflictError) {
    res.status(409).json(
      options?.room ? { error: error.message, room: options.room } : { error: error.message },
    );
    return;
  }

  if (isHttpError(error)) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  if (error instanceof AuthenticationError) {
    res.status(503).json({ error: "OpenAI API key is missing or invalid. Set OPENAI_API_KEY on the server." });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ error: fallbackMessage });
}
