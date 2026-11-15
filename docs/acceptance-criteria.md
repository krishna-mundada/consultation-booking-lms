# Acceptance criteria

Source of truth: the Contour Education "Technical Assessment | Software Engineer" email
(Rose Joseph, People and Culture, sent 12 Nov 2026). Each requirement is quoted or closely
paraphrased, given an id, and assigned the **cheapest layer that can falsify it**
(DB = pgTAP, UNIT = Vitest service/schema, API = route handler tests, UI = Vitest + Testing
Library, E2E = Playwright, DOC = review/checklist).

Tests name the AC id(s) they cover; [traceability.md](traceability.md) maps every criterion to its tests.

## Functional

| ID | Requirement (from the email) | Layer(s) |
| --- | --- | --- |
| AC-1 | Authentication: sign up, log in, log out | E2E |
| AC-2 | Student dashboard lists the student's own consultations | DB, API, E2E |
| AC-3 | A student can mark an individual consultation complete or incomplete. Revised: complete only once it has started (see AC-33) | UNIT, DB, API, UI, E2E |
| AC-4 | Booking form creates a consultation. The brief lists first name, last name, reason and datetime; revised in review: the name is asked at sign-up (AC-30), the form takes a tutor, a day and time, and an optional reason (README, "Where this departs from the brief") | UNIT, API, UI, E2E |
| AC-5 | A student can reschedule their own consultation | UNIT, API, UI, E2E |
| AC-6 | A student can cancel their own consultation | UNIT, API, UI, E2E |
| AC-7 | A user with an "Admin" role can see a list of all consultations across the system (read-only is fine), searchable, sortable and filterable | DB, API, UI, E2E |

## Access control ("we want to see how you define roles", "how well you secure the application")

| ID | Requirement | Layer(s) |
| --- | --- | --- |
| AC-8 | A student can never read another student's consultations | DB, API, E2E |
| AC-9 | A student can never modify another student's consultations (reschedule, cancel, complete) | DB, UNIT, API, E2E |
| AC-10 | Non-admins cannot reach the admin list (API returns 403, page redirects) | API, E2E |
| AC-11 | Nobody can grant themselves the admin role (sign-up input, API, direct DB) | DB, API |
| AC-12 | The admin view is read-only: admins have no write path to consultations at all. (Their only write is making and unmaking tutors, AC-32.) | DB, API, UI, E2E |
| AC-13 | Anonymous requests to any data route are rejected (401) | API, E2E |
| AC-14 | RBAC approach is justified in the README (RLS is allowed; any alternative must be justified) | DOC |

## Engineering constraints

| ID | Requirement | Layer(s) |
| --- | --- | --- |
| AC-15 | Stack: Next.js 15/16 App Router, TypeScript, Supabase (supabase-js, @supabase/ssr, PostgreSQL) | DOC (config review) |
| AC-16 | Prefer APIs over Server Actions (auth actions from the starter template are acceptable) | DOC, API |
| AC-17 | Input is validated server-side; invalid input gets 400 with a useful message | UNIT, API |
| AC-18 | Scalable approach: paginated lists, indexes matching the queries, no per-row policy re-evaluation | DB, API |
| AC-19 | Consistent choices across the codebase (naming, error shape, date convention, layering) | DOC (parallel code audit) |
| AC-20 | Component library used for UI (shadcn/ui); UI polish is low weight but must work at common viewports | UI, DOC (responsive check) |
| AC-21 | Non-obvious decisions are recorded with their reasons | DOC (ADRs) |

## Deliverables

| ID | Requirement | Layer(s) |
| --- | --- | --- |
| AC-22 | README with special setup instructions | DOC (fresh-clone run) |
| AC-23 | README with justifications and assumptions | DOC |
| AC-24 | README with a summary of the overall implementation | DOC |
| AC-25 | Database migrations plus schema included | DB, DOC |
| AC-26 | The work is submitted through the provided upload link before the deadline | DOC (manual) |

## Implicit requirements I am deliberately adding (and why)

| ID | Requirement | Why |
| --- | --- | --- |
| AC-27 | A past datetime cannot be booked or rescheduled to | The form says "datetime for consultation"; a booking in the past is meaningless. Assumption, stated in README. |
| AC-28 | A cancelled consultation cannot be rescheduled or completed | State-machine integrity; avoids contradictory records. Assumption, stated in README. |
| AC-29 | Cancel keeps the record (soft cancel) | Admins asked to see "all consultations"; history matters; no delete policy needed. Assumption. |

## The tutor model (decided in review; see ADR 0007)

| ID | Requirement | Layer(s) |
| --- | --- | --- |
| AC-30 | Three roles: student, tutor, admin, one per person. Everyone who signs up is a student and gives a first and last name, which become their display name. No role can be raised from the browser | DB, UNIT, UI, E2E |
| AC-31 | A student books with a tutor, at a free half-hour slot (weekday, 9:00 to 16:30 Melbourne time, at least an hour ahead, at most eight weeks), with an optional free-text reason. Times are shown in Melbourne time with the AEDT/AEST label | DB, UNIT, API, UI, E2E |
| AC-32 | An admin makes and unmakes tutors from a People table (search by name or email). Turning off a tutor with upcoming consultations needs a choice: cancel them and notify the students, or keep them. Admins cannot be changed | DB, API, UI, E2E |
| AC-33 | A consultation can be marked complete only once it has started; unticking is always allowed; a cancelled one cannot be ticked | DB, UNIT, API, UI, E2E |
| AC-34 | Two students cannot hold the same tutor at the same time, even when they click together (the database decides); one student cannot hold two consultations at the same time; a cancellation frees the slot | DB, API, E2E |
| AC-35 | A tutor sees every consultation booked with them (view only), also after they stop being a tutor, and can be booked only while they are one | DB, API, UI, E2E |
| AC-36 | Cancelling because a tutor was turned off notifies each student in the app, in fixed wording that never repeats the reason; the notice stays until dismissed | DB, API, UI, E2E |
| AC-37 | Every list is a server-side data table or list: search, sort, filters and paging in the URL, one query convention and one response envelope for every list endpoint, unknown parameters refused with a 400 that lists what is allowed | UNIT, API, UI |
| AC-38 | A consultation looks the same wherever it is shown: Upcoming and Earlier go by time alone; its badge, tile and sort/filter all use the same four states (scheduled, not marked complete, complete, cancelled) | DB, UNIT, API, UI |

## Out of scope (to keep the submission small)

Email notifications, tutors setting their own availability, public holidays, a CSV export, payments, multiple admin
roles, admin write actions on consultations, deployment. Each is listed under "what I would do next" in the README.

## Traceability

The table mapping each criterion to the tests that prove it is in [traceability.md](traceability.md).
