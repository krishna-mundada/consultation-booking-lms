// HTTP details shared by the route wrapper (server) and the API client (browser).

export const CONTENT_TYPE_JSON = "application/json";

/** True for `application/json` with or without parameters (e.g. `; charset=utf-8`). */
export const isJsonContentType = (value: string | null | undefined): boolean =>
  new RegExp(`^${CONTENT_TYPE_JSON.replace("/", "\\/")}\\s*(;|$)`, "i").test(value ?? "");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True for a write that a browser says came from another site. Browsers attach `Origin` to
 * cross-site writes and `Sec-Fetch-Site` to every request; a call without them (a script, or
 * server to server) carries no browser credentials worth protecting and passes. This backs up the
 * SameSite cookie and the JSON-only content type.
 */
export function isCrossSiteWrite(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) return true;
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

/** Authenticated responses must never be cached or shared (docs/decisions/0003). */
export const CACHE_CONTROL_PRIVATE = "private, no-store";
