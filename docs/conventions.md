# Conventions

Decided up front so they stay consistent (AC-19). These are meanings, not types: the compiler cannot
catch a mismatch, so every consumer is listed and audited at the end (convention-change-audit).

## C1. Time: `scheduled_at` is a UTC instant

- Meaning: the exact moment the consultation starts, stored as `timestamptz`.
- Wire format: ISO-8601 string with an explicit offset (`2026-12-01T09:30:00+11:00` or `...Z`).
  Naive strings (no offset) are rejected with 400.
- Bookings live in one fixed zone, **Australia/Melbourne** (ADR 0007, A12). The student never types a time: they
  pick a day and one of that day's slots, which `lib/domain/slots.ts` builds from Melbourne wall-clock time, and the
  API receives the UTC instant. `lib/dates.ts` words every time with its AEDT/AEST label. Nothing depends on the
  viewer's own zone, and no other file converts times.
- A bookable time is on the half hour, a weekday, 9:00 to 16:30 Melbourne time, at least an hour from `now()` and at
  most 56 days ahead, judged on the server and again by the database.
- DST: slots are built with `Intl` for the zone, so the clock change is handled; tests cover a spring-forward and a
  fall-back date.
- Consumers to audit: column type and CHECK, the rule trigger, Zod schema, service, route, slot picker, display
  helpers, seed data, every test fixture.

## C2. State: two stored fields, four words shown

- `status`: `scheduled` or `cancelled` (terminal). Cancelling never deletes.
- `completed`: boolean. It can be ticked only once the consultation has started (and never on a cancelled one);
  unticking is always allowed.
- What a person sees is one of four states, worked out in the database as `consultation_details.state`:
  `cancelled`, `complete`, `awaiting` ("Not marked complete": its time has come, not ticked) or `scheduled`. The
  badge, the Status sort and the Status filter all use these four words; the tile colour comes from the same rule
  (`consultationTone`), and Upcoming vs Earlier is by time alone.
- Consumers: constraint, rule trigger, the view, Zod enums, service guard, list `can_edit` and `can_complete`, UI
  badges and disabled states, both tables, tests.

## C3. Naming and shapes

- snake_case in SQL, JSON bodies, query parameters and generated types. camelCase only for local TS variables and React props.
- ids are UUIDs, validated as GUIDs at the route boundary (Postgres accepts any 8-4-4-4-12 hex id; a stricter
  version-digit check would refuse ids the database made).
- List envelope: `{ data, meta: { page: { number, size, total, total_pages } } }`. Single: `{ data }`.
  Error: `{ error: { code, message, details? } }`.
- HTTP codes: 400 validation, 401 unauthenticated, 403 authenticated but not allowed, 404 missing or not yours,
  409 invalid state transition, 415 request body is not `application/json` (writes only),
  500 generic.
- Lists (every list endpoint): `page[number]` 1 to 1,000, `page[size]` 1 to 100, `sort=-field,field` (at most
  three), `filter[field]` or `filter[field][eq|in|gte|lte]`, `filter[q]` (at most 100 characters). Unknown, repeated or
  malformed parameters are a 400 that lists what is allowed. A page past the last row is an empty page with the true
  `total`, not an error. The state of a table lives in the page's URL as `page`, `size`, `sort`, `q` and one
  parameter per filter.

## C4. Roles

- One role per user in `profiles.role`: `student`, `tutor` or `admin`. Default `student`. Never set from client
  input.
- The only code path that writes a role is `admin_set_tutor()` (an admin making or unmaking a tutor, never touching
  an admin). Admins are created only in SQL or the seed.

## C5. Process

- Tests cite the AC ids they prove in the `describe` or test title (or, for a whole file, in its header
  comment). The traceability table in the README is the audited mapping; commits are small and RED
  commits precede GREEN commits.
- Commit prefixes: `test:`, `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- No `any`, no non-null assertions on external data, no `eslint-disable` without a written reason.
