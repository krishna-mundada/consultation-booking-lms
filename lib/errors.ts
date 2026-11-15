import { MESSAGES } from "@/lib/messages";

// One error vocabulary for the whole server side (docs/conventions.md C3). Services throw
// these; the route wrapper maps them to the response shape and status code.

export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  unsupportedMediaType: 415,
  internal: 500,
} as const;

/** The `error.code` every API error carries. */
export const ERROR_CODE = {
  validation: "VALIDATION_ERROR",
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  unsupportedMediaType: "UNSUPPORTED_MEDIA_TYPE",
  internal: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** Field name to its messages. The shape of `error.details.fields` in every API error. */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: { fields?: FieldErrors },
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields?: FieldErrors) {
    super(ERROR_CODE.validation, HTTP_STATUS.badRequest, message, fields ? { fields } : undefined);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message: string = MESSAGES.notAuthenticated) {
    super(ERROR_CODE.unauthenticated, HTTP_STATUS.unauthorized, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = MESSAGES.forbidden) {
    super(ERROR_CODE.forbidden, HTTP_STATUS.forbidden, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = MESSAGES.notFound) {
    super(ERROR_CODE.notFound, HTTP_STATUS.notFound, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(ERROR_CODE.conflict, HTTP_STATUS.conflict, message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string = MESSAGES.unsupportedMediaType) {
    super(ERROR_CODE.unsupportedMediaType, HTTP_STATUS.unsupportedMediaType, message);
  }
}

export class InternalError extends AppError {
  constructor(message: string = MESSAGES.generic) {
    super("INTERNAL", HTTP_STATUS.internal, message);
  }
}
