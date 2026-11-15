import { MESSAGES } from "@/lib/messages";

/** Where a failure happened, for the few codes whose meaning depends on it. */
type AuthContext = "login" | "signUp" | "forgotPassword" | "updatePassword";

// Supabase Auth error codes (https://supabase.com/docs/guides/auth/debugging/error-codes) mapped to
// fixed text. Its own wording is never shown: it can reveal which emails have accounts, and it is
// written for developers.
const BY_CODE: Record<string, string> = {
  weak_password: MESSAGES.weakPassword,
  invalid_credentials: MESSAGES.incorrectLogin,
  user_already_exists: MESSAGES.accountMayExist,
  email_exists: MESSAGES.accountMayExist,
  email_not_confirmed: MESSAGES.confirmEmail,
  over_request_rate_limit: MESSAGES.tooManyAttempts,
  over_email_send_rate_limit: MESSAGES.tooManyAttempts,
  same_password: MESSAGES.samePassword,
};

// Codes that only mean something in one place: with no session, a password change can only be
// an expired or already-used reset link.
const BY_CONTEXT: Partial<Record<AuthContext, Record<string, string>>> = {
  updatePassword: { session_not_found: MESSAGES.resetLinkExpired, session_expired: MESSAGES.resetLinkExpired },
};

/**
 * The error's code. The library's client-side "no session" error carries a name instead of a code,
 * so it is treated as the equivalent server code.
 */
function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("name" in error && error.name === "AuthSessionMissingError") return "session_not_found";
  return null;
}

/** The message a person sees when an Auth call fails. Anything unrecognised is the generic text. */
export function authErrorMessage(error: unknown, context: AuthContext): string {
  const code = codeOf(error);
  if (code === null) return MESSAGES.generic;
  return BY_CONTEXT[context]?.[code] ?? BY_CODE[code] ?? MESSAGES.generic;
}
