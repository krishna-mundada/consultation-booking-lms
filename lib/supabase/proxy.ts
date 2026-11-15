import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PROXY_PUBLIC_PREFIXES, ROUTES } from "@/lib/routes";
import { supabaseEnv } from "@/lib/supabase/env";

// Keeps the session cookie fresh and sends visitors without a session to the login page.
//
// This is a convenience, not the security boundary: it checks the JWT locally with getClaims()
// (no network call, so it is cheap enough to run on every request), which cannot see a session
// that was revoked server-side until the token expires. Anything that matters re-validates with
// getUser() (docs/decisions/0003), and the API and database enforce access independently.

// A prefix matches the path itself and anything below it, not other names that start the same way.
export const isPublicPath = (pathname: string) =>
  pathname === ROUTES.home ||
  PROXY_PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, publishableKey } = supabaseEnv();

  // A new client per request (never a module-level one), and no code between creating it and
  // getClaims(): a gap there can make users randomly lose their session.
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        // When a token refresh sets a cookie, the library supplies cache headers
        // (Cache-Control: no-store and friends) so a CDN cannot cache and replay the Set-Cookie
        // to another visitor. They must go on the response.
        Object.entries(cacheHeaders).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.login;
    return NextResponse.redirect(redirectUrl);
  }

  // Return this response object as it is: it carries the refreshed cookies. Building a new one
  // would drop them and end the user's session early.
  return supabaseResponse;
}
