// Helpers for the email-confirmation link (/auth/confirm), which carries two values from the
// query string. Neither is trusted: `type` is checked against an allow-list and `next` may only
// ever point at a path on this site (otherwise the link is an open redirect).
import { ROUTES } from "@/lib/routes";

// Only the emails this app sends: sign-up confirmation and password recovery.
const OTP_TYPES = ["signup", "recovery"] as const;

type OtpType = (typeof OTP_TYPES)[number];

export function parseOtpType(value: string | null | undefined): OtpType | null {
  return OTP_TYPES.find((type) => type === value) ?? null;
}

// One leading slash that is not followed by another slash or a backslash (those make a
// protocol-relative URL), and no backslashes or control characters anywhere (header injection,
// and browsers treat a backslash like a slash).
const SAME_SITE_PATH = /^\/(?![/\\])[^\\\u0000-\u001f\u007f]*$/;

export function safeRedirectPath(next: string | null | undefined, fallback: string = ROUTES.dashboard): string {
  return next && SAME_SITE_PATH.test(next) ? next : fallback;
}
