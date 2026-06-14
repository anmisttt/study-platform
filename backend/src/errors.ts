export class UserError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ServerError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "ServerError";
    this.statusCode = statusCode;
  }
}

export function isHttpError(
  error: unknown,
): error is UserError | NotFoundError | ConflictError | ServerError {
  return (
    error instanceof UserError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof ServerError
  );
}
