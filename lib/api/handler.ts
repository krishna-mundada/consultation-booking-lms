import { connection, NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  AppError,
  ForbiddenError,
  InternalError,
  UnauthenticatedError,
  UnsupportedMediaTypeError,
  ValidationError,
  HTTP_STATUS,
  type FieldErrors,
} from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import { CACHE_CONTROL_PRIVATE, isCrossSiteWrite, isJsonContentType } from "@/lib/api/http";
import type { ErrorEnvelope } from "@/lib/schemas/api";
import { createServices, type Services } from "@/lib/services";

// The only place that knows how HTTP and the service layer meet: authenticate, run, map errors.
// Route files stay thin (parse input, call one service method, return data).

const HEADERS = { "Cache-Control": CACHE_CONTROL_PRIVATE };

/** Key under which problems with the whole body (not one field) are reported. */
const FORM_LEVEL_FIELD = "_form";

export function json(body: unknown, status: number = HTTP_STATUS.ok): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function errorResponse(error: AppError): NextResponse {
  const body: ErrorEnvelope = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  return json(body, error.status);
}

/** Flattens a Zod error into the API's field-error shape (form-level problems under `_form`). */
function toFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const name = issue.path.length > 0 ? String(issue.path[0]) : FORM_LEVEL_FIELD;
    (fields[name] ??= []).push(issue.message);
  }
  return fields;
}

/** Validates with a Zod schema and throws our ValidationError with per-field messages. */
export function parse<T>(schema: ZodType<T>, input: unknown, message: string = MESSAGES.invalidRequest): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ValidationError(message, toFieldErrors(result.error));
}

/**
 * Reads a JSON request body. Requires `Content-Type: application/json`: a cross-site HTML form
 * can only send text/plain, urlencoded or multipart, so refusing those is a second line of
 * defence against CSRF behind the SameSite=Lax session cookie.
 */
export async function readJson(request: Request): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type"))) throw new UnsupportedMediaTypeError();
  try {
    return await request.json();
  } catch {
    throw new ValidationError(MESSAGES.invalidJson);
  }
}

/**
 * Authenticates with getUser() (which re-validates the session with the Auth server, ADR 0003),
 * builds the services around the caller's own client so RLS applies, runs the handler, and turns
 * thrown errors into the standard response shape. Unknown errors are logged here and answered
 * with a generic message so internals never leak.
 */
async function authenticated(
  request: Request,
  run: (services: Services) => Promise<NextResponse>,
): Promise<NextResponse> {
  // Marks the handler request-time. Must stay OUTSIDE the try/catch: during build Next makes
  // connection() reject on purpose to detect dynamic routes, and swallowing that signal would
  // both log a bogus error and defeat the detection.
  await connection();
  try {
    // Before anything else: a write from another site is refused whether or not it is signed in.
    if (isCrossSiteWrite(request)) throw new ForbiddenError(MESSAGES.crossSiteRequest);
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) throw new UnauthenticatedError();
    return await run(createServices(supabase, user.id));
  } catch (error) {
    if (error instanceof AppError) return errorResponse(error);
    console.error("[api] unhandled error", error);
    return errorResponse(new InternalError());
  }
}

type Context = { request: Request; services: Services };

/** A route with no path parameters. */
export function handle(fn: (ctx: Context) => Promise<NextResponse>) {
  return (request: Request) => authenticated(request, (services) => fn({ request, services }));
}

/** A route with typed path parameters (e.g. `[id]`). */
export function handleWithParams<P>(fn: (ctx: Context & { params: P }) => Promise<NextResponse>) {
  return (request: Request, route: { params: Promise<P> }) =>
    authenticated(request, async (services) => fn({ request, services, params: await route.params }));
}
