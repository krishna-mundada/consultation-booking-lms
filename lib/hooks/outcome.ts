import { ApiError } from "@/lib/api/client";
import { HTTP_STATUS, type FieldErrors } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";

/** What a user action produced: success, or a message (and per-field messages) to show. */
export type Outcome =
  | { ok: true }
  | { ok: false; message: string; fields: FieldErrors; sessionExpired: boolean; status: number };

/** The server answered 401: the session ended (signed out elsewhere, expired, cookies cleared). */
export const isSessionExpired = (error: unknown) => error instanceof ApiError && error.status === HTTP_STATUS.unauthorized;

/** The words to show for a failed call. */
export function describeError(error: unknown): { message: string; fields: FieldErrors; status: number } {
  if (error instanceof ApiError) {
    if (isSessionExpired(error)) return { message: MESSAGES.sessionExpired, fields: {}, status: error.status };
    return { message: error.message, fields: error.fields, status: error.status };
  }
  return { message: MESSAGES.generic, fields: {}, status: 0 };
}

/** Runs an API call and reports the result as an Outcome instead of throwing. */
export async function toOutcome(action: () => Promise<unknown>): Promise<Outcome> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    return { ok: false, sessionExpired: isSessionExpired(error), ...describeError(error) };
  }
}
