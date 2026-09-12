import { MAX_ANSWER_LENGTH } from "@study-platform/shared";
import { UserError } from "../errors";

export function ensureAnswer(answer: unknown): string {
  if (typeof answer !== "string") {
    throw new UserError("Request body must include string field 'answer'.");
  }

  if (answer.length > MAX_ANSWER_LENGTH) {
    throw new UserError(`Answer must not exceed ${MAX_ANSWER_LENGTH} characters.`);
  }

  return answer;
}

export function ensureBaseRevision(baseRevision: unknown): number {
  if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision) || baseRevision < 0) {
    throw new UserError("Request body must include non-negative integer field 'baseRevision'.");
  }

  return baseRevision;
}
