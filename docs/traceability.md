# Traceability: acceptance criterion to proof

`pg` = `supabase/tests/database`, others under `tests/`. AC-14 to AC-26 are documentation and
process requirements, shown with where they are met. AC-30 onward come from the tutor model
([ADR 0007](decisions/0007-roles-tutors-and-notifications.md)).

| AC | Requirement | Proven by |
| --- | --- | --- |
| 1 | Sign up, log in, log out | `e2e/auth`; `ui/sign-up-form`; `integration/exposure` (real sign-up, password policy) |
| 2 | Student lists their consultations | `pg/020`; `integration/consultations-service` (listOwn); `api/consultations` (GET); `ui/consultation-list`; `e2e/student-journey` |
| 3 | Mark complete / incomplete | `pg/020`, `pg/030`; `unit/rules`; `integration/consultations-service`; `api/consultations` (PATCH); `ui/consultation-list` |
| 4 | Booking form | `unit/schemas`; `ui/booking-form`, `ui/tutor-picker`, `ui/slot-picker`; `api/consultations` (POST); `e2e/student-journey` |
| 5 | Reschedule own consultation | `integration/consultations-service`; `api/consultations`, `api/tutors`; `ui/consultation-list`; `pg/030`; `e2e/student-journey` |
| 6 | Cancel own consultation | `integration/consultations-service`; `api/consultations`; `ui/consultation-list`; `pg/030`; `e2e/student-journey` |
| 7 | Admin sees all, read-only | `pg/020`; `api/consultations` (admin); `ui/consultation-tables`; `e2e/roles` |
| 8 | A student never reads another's rows | `pg/020`; `integration/consultations-service`; `api/consultations`; `e2e/student-journey` (isolation) |
| 9 | A student never changes another's rows | `pg/020`, `pg/030`; `integration/consultations-service`; `api/consultations` (cross-user matrix); `e2e/student-journey` |
| 10 | Non-admins cannot reach the admin list | `api/consultations`, `api/people` (403); `e2e/roles` (redirects and 403) |
| 11 | Nobody can grant themselves a role | `pg/010`, `pg/040`; `integration/exposure` (real sign-up, REST PATCH, RPC); `api/people` |
| 12 | Admin has no write path to consultations | `pg/020`; `api/consultations` (admin and tutor matrix); `ui/consultation-tables`; `e2e/roles` |
| 13 | Anonymous requests are rejected | `pg/020`; `api/consultations`, `api/people` (401 on all routes); `integration/exposure`; `e2e/auth` |
| 14 | RBAC approach justified | [README](../README.md); [ADR 0001](decisions/0001-rbac-profiles-role-and-rls.md), [ADR 0007](decisions/0007-roles-tutors-and-notifications.md) |
| 15 | Required stack | `package.json`, `next.config.ts`, `supabase/` |
| 16 | APIs over Server Actions | `unit/architecture-guards` (no `use server`); `app/api/**` |
| 17 | Server-side validation, useful errors | `unit/schemas`, `unit/list-query`; `api/consultations`, `api/hostile-input` (400 with codes and field details); `ui/booking-form`; `pg/030` |
| 18 | Scalable: paging, indexes, no per-row policy cost | `pg/020` (indexes); `api/list-convention` (paging on every list); [ADR 0001](decisions/0001-rbac-profiles-role-and-rls.md) |
| 19 | Consistent choices | [docs/conventions.md](conventions.md); `api/list-convention` |
| 20 | Component library; works at common sizes | shadcn/ui; `ui/*`; `e2e/student-journey` (320px to 1920px); `e2e/ui-behaviour` (long text) |
| 21 | Decisions understood and recorded | [docs/decisions/](decisions/) |
| 22-24 | README: setup, justifications, summary | [README](../README.md) |
| 25 | Migrations and schema | `supabase/migrations/`, `supabase/schema.sql`; `pg/*` |
| 26 | Submitted within 48 hours | Manual |
| 27 | No past times | `unit/slots`; `integration/consultations-service`; `api/consultations`; `pg/030` |
| 28 | Cancelled is terminal | `unit/rules`; `integration/consultations-service`; `api/consultations` (409); `ui/consultation-list`; `pg/030` |
| 29 | Cancel keeps the record | `integration/consultations-service`; `api/consultations`; `e2e/student-journey` |
| 30 | Three roles; sign-up is always a student, with a name | `pg/010`; `unit/roles`; `ui/sign-up-form`; `e2e/auth` |
| 31 | Booking rules: tutor, slot, hours, notice, horizon, zone | `pg/030`; `unit/slots`, `unit/dates`; `integration/consultations-service`; `api/consultations`; `ui/slot-picker`, `ui/booking-form`; `e2e/student-journey` |
| 32 | Admin makes and unmakes tutors; cancel-or-keep | `pg/040`; `integration/people-and-notifications`; `api/people`; `ui/people-table`; `e2e/roles` |
| 33 | Complete only after it starts | `pg/030`; `unit/rules`; `integration/consultations-service`; `api/consultations`; `ui/consultation-list`; `e2e/student-journey` |
| 34 | No double booking, race decided by the database | `pg/030`; `integration/consultations-service`, `integration/exposure`; `api/tutors`; `e2e/student-journey` (two students, one slot) |
| 35 | Tutor sees their sessions, also after demotion | `pg/020`, `pg/040`; `integration/consultations-service`; `api/consultations`, `api/people`; `ui/consultation-tables`; `e2e/roles` |
| 36 | Notifications on cancel-by-demotion | `pg/040`; `integration/people-and-notifications`; `api/people`; `ui/notification-banner`; `e2e/roles` |
| 37 | One list convention, data tables with URL state | `unit/list-query`, `unit/list-state`; `api/list-convention`; `ui/data-table`, `ui/list-toolbar`, `ui/pager`, `ui/use-server-list`, `ui/consultation-tables` |
| 38 | One rule for how a consultation looks and is sorted | `pg/030` (state); `unit/rules` (tone); `api/consultations` (sort and filter by status); `ui/consultation-list` |
