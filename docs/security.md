# Security notes

Result of the production-readiness gate (security checklist, dependency and secret scans). Each
control names the test that proves it. Design rationale is in [decisions/](decisions/).

## Controls and how they are verified

| Control | Where it is enforced | Proven by |
| --- | --- | --- |
| Students see and change only their own consultations; a tutor sees only those booked with them | Grants, RLS policies, service ownership filter, route | pgTAP `020`, `030`, `consultations-service.test.ts`, `consultations.spec.ts`, E2E isolation test |
| Admins and tutors cannot write consultations | Insert and update policies are for students only; no other write policy or grant; the service answers 403; they are redirected away from the dashboard | pgTAP `020`, API 403 for admin and tutor POST and PATCH, `consultations-service.test.ts`, `e2e/roles` |
| Nobody can grant themselves a role | No write grant on `profiles`; sign-up trigger ignores metadata; `admin_set_tutor()` refuses non-admins and never touches an admin | pgTAP `010`, `040`, `exposure.test.ts` (real sign-up, REST PATCH, RPC as student and tutor), `people.spec.ts` |
| Emails are visible only to admins | They live in `auth.users`; only admin-only `security definer` functions read them; students see a tutor's display name and nothing else | pgTAP `040`, `exposure.test.ts`, `tutors.spec.ts` (picker returns only `id` and `display_name`) |
| The rules hold when the app is bypassed | A trigger enforces slot grid, hours, notice, horizon, tutor, state and Completed-after-start; unique indexes stop double booking | pgTAP `030`, `exposure.test.ts` (direct REST), `consultations-service.test.ts` (race) |
| Search text cannot reach a query as syntax | The list parser turns wildcard, quote, comma, parenthesis and control characters into spaces; field names come from a declared list, never from the client; the people search escapes `LIKE` characters | `list-query.test.ts`, `list-convention.spec.ts`, pgTAP `040` |
| Notifications are private and cannot be forged | Own rows only; users may only set `read_at`; rows are written by the demotion function | pgTAP `040`, `exposure.test.ts`, `people.spec.ts` |
| Anonymous callers are rejected | No `anon` grants; every API request is authenticated with `getUser()` (the proxy only checks the token locally for redirects) | pgTAP anon cases, API 401 tests, `exposure.test.ts` |
| Session is re-validated, not just decoded | `auth.getUser()` in route handlers and the admin gate | ADR 0003 |
| Helper functions are not callable over the API | `private` schema (not exposed); execute revoked from `public`/`anon` | `exposure.test.ts` (RPC returns 404) |
| The app never holds the service-role key | Only the publishable key is configured; guard test scans app code | `architecture-guards.test.ts` |
| Input is validated server-side | Zod on every route; DB `CHECK` constraints behind it | `schemas.test.ts`, API 400 tests, pgTAP constraints |
| Errors do not leak internals | Unknown errors are logged server-side and answered with a generic message | `handler.ts`; DB errors are mapped to `INTERNAL` in the service |
| Writes must be JSON (CSRF defence in depth) | 415 unless `Content-Type: application/json`, behind `SameSite=Lax` cookies | `security.spec.ts` |
| Writes from another site are refused | 403 when `Origin` or `Sec-Fetch-Site` says the request is cross-site, checked before authentication | `cross-site.test.ts`, `security.spec.ts` |
| Authenticated responses are never cached | `Cache-Control: private, no-store` on every API response | `list-convention.spec.ts`, API tests |
| Baseline hardening headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | `security.spec.ts` |
| Password policy | Auth config: 8+ characters, letters and digits | `exposure.test.ts` (weak passwords rejected) |
| Email links can only do what the app sends | `/auth/confirm` accepts only `signup` and `recovery`; `next` must be a same-site path | `safe-redirect.test.ts`, `security.spec.ts` |
| The error page cannot be made to show attacker text | Fixed wording; the failure reason is never put in the URL | `ui-behaviour.spec.ts` |
| Credentials and bookings never end up in a URL | Every form posts, and its submit button stays disabled until the page is interactive, so a native submit cannot happen | `ui-behaviour.spec.ts` (app bundles blocked) |
| Unused API surface is switched off | Only `public` is exposed (no `graphql_public`); password change needs a recent login | `exposure.test.ts` (GraphQL refused), `config.toml` |

## Scans run

- **Secrets:** pattern scan of the working tree and all git history (Supabase secret keys, JWTs,
  private keys, cloud and API tokens): no findings. `.env.local` is git-ignored and holds only the
  public URL and publishable key. The seed's passwords are local-only and documented as such.
- **Dependencies:** `npm audit --omit=dev` reports **0 vulnerabilities** (production dependencies).
- **Versions:** dependencies use version ranges that match the lockfile, not `latest`.

## Accepted risks (documented, not ignored)

| Item | Why it is accepted | What would change it |
| --- | --- | --- |
| `npm audit` reports a `minimatch` ReDoS advisory nested in the TypeScript-ESLint toolchain (dev only) | Never shipped or run in production, and exploitable only with attacker-controlled glob patterns, which this repo never takes. The fix needs `npm audit fix --force` (breaking) | Upgrade TypeScript-ESLint when a compatible release lands |
| No script restrictions in the Content-Security-Policy | The policy sets framing, base-URI, form-target and plugin rules. Restricting scripts needs per-request nonces for Next's inline scripts, and a loose script-src gives false comfort | Add a nonce-based script-src in the proxy |
| No rate limiting on the API | Supabase Auth rate-limits its own endpoints; the booking API is low-value to abuse here | Edge or per-user rate limiting |
| Offset pagination with an exact count | Fine at this size; indexes match the sort | Keyset cursor on `(scheduled_at, id)` |
| Email search on the People screen is an unindexed `ILIKE` over `auth.users` inside an admin-only function | Admin-only, paged, and fine for thousands of people | An email copy on `profiles` with a trigram index |
| The tests share the demo database | Each test makes its own users, so they never collide, but the demo data fills up | A separate database for tests; `supabase db reset` before a demo |
| Request body size is not capped in the route | Platform limits apply and field lengths are validated after parsing | Reject by `Content-Length` before parsing |

## Before deploying to a hosted Supabase project

1. Enable **email confirmation** (it is off only in the local `config.toml`).
2. Set the password policy in the dashboard to match `config.toml` (8+ characters, letters and digits).
3. Do **not** run `supabase/seed.sql` (public local passwords). Create the first admin with a one-off SQL update on
   `profiles`; tutors are then made from the People screen.
4. Set the site URL and redirect allow-list to the real origin.
5. Do not `supabase config push` the local `config.toml` as it is: it turns email confirmation off and
   points the site URL at localhost. Change those in the dashboard (or a remote override) first.
6. Provide only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the app.
