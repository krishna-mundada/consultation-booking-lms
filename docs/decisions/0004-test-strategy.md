# ADR 0004: Test strategy and pyramid

Status: accepted · Covers: AC-2..AC-13, AC-17, AC-18

## Context
Supabase recommends pgTAP for database and RLS testing (`supabase test db`), wrapped in
`begin ... rollback` for isolation, with `set local role authenticated` and JWT claims to act as
a user, and with negative cases ("what users should not be able to do") tested explicitly.
Application-level tests cannot use transactions, so they should use unique user ids rather than reset
the database for each test.
([Testing overview](https://supabase.com/docs/guides/local-development/testing/overview))

## Decision (cheapest layer that can falsify each AC; push tests down)

| Layer | Tool | Proves |
| --- | --- | --- |
| Database | pgTAP (`supabase/tests/database`) | grants, RLS matrix, constraints, signup trigger, no self-promotion |
| Unit | Vitest | Zod schemas, pure business rules, date helpers, redirect and path checks |
| Integration | Vitest against the local Supabase stack | the service layer under real RLS; direct REST attacks |
| API | Playwright (HTTP only) against the running app | route status codes (400/401/403/404/415), ownership, pagination, cache and security headers |
| UI | Vitest + Testing Library (+ MSW) | forms, hooks, error and empty states |
| E2E | Playwright in Chromium, Firefox and WebKit | full student flow incl. persistence after reload, cross-user isolation, admin read-only, layout at common widths |

- Write the failing test first, see it fail for the right reason, then implement (RED then GREEN commits).
- Test titles cite AC ids; the final gate checks that each AC has a passing test.
- Fixture users come from the Auth admin API with unique ids (service key used only in tests).
- Not adding the third-party `basejump` test-helpers extension; a small local helper file
  (`create_user`, `authenticate_as`) avoids an extra dependency.
