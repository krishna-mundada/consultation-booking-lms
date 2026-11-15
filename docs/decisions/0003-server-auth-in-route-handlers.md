# ADR 0003: `getUser()` for authorization, `getClaims()` only for session refresh

Status: accepted · Covers: AC-1, AC-13, AC-10

## Context
Supabase's SSR guide says that only `getUser()` confirms with the Auth server that a session is
still valid or that the user has not logged out. `getClaims()` checks the JWT signature and expiry
locally. It also warns that cached responses carrying `Set-Cookie` (ISR, CDN) can hand one user's
session to another, and recommends `Cache-Control: private, no-store` on authenticated routes
(`@supabase/ssr` >= 0.10 sets this itself).
([Advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide))

## Decision
- Route Handlers and the admin layout authorize with `supabase.auth.getUser()`.
- The proxy (the starter's session-refresh step) may use `getClaims()`; it only refreshes cookies and
  redirects unauthenticated page loads. It is not the security boundary.
- Authenticated routes are never cached or statically generated. Verify the installed
  `@supabase/ssr` version is >= 0.10, and assert the `Cache-Control` header in an API test.
- Route handlers use the request-scoped server client, so every query runs as the user and RLS applies.
  The service-role key does not exist in app code.

## Consequences
One extra Auth round trip per API call. Acceptable for this scale; the alternative is trusting
a possibly revoked session.
