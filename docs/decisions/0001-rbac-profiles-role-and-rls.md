# ADR 0001: RBAC with `profiles.role` and RLS, not a custom-claims auth hook

Status: accepted; the role set grew from two to three in [ADR 0007](0007-roles-tutors-and-notifications.md) (the mechanism is unchanged) · Covers: AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-14, AC-18

## Context
The brief wants two roles (student, admin) and says RBAC can be done any way as long as it is
justified. Supabase documents two RLS-based patterns:

1. **Custom Access Token Hook:** a `user_roles` table, a Postgres hook that copies the role into the
   JWT, and policies that read `auth.jwt()`.
   ([Custom Claims & RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac))
2. **Role lookup in a `security definer` function**, called from policies as `(select fn())`.
   ([RLS performance recommendations](https://supabase.com/docs/guides/database/postgres/row-level-security))

## Options compared

| | Hook + JWT claim | `profiles.role` + `(select private.is_admin())` |
| --- | --- | --- |
| Per-query cost | none (claim already in token) | one initPlan lookup per statement; docs benchmark ~99.9% faster than unwrapped |
| Role change takes effect | only after token refresh. Supabase warns a JWT "is not always fresh" | immediately |
| Moving parts | hook function, grants to `supabase_auth_admin`, `config.toml` hook wiring, JWT decoding in the app | one table, one function |
| Testable in pgTAP | needs hand-built JWT claims | plain `set local role` + sub claim |
| Cookie size | adds a claim | no change |

## Decision
Use a single `role` column on `profiles` (one role per user) and two security-definer functions
wrapped in `(select ...)` inside policies, so Postgres evaluates each once per statement:
`private.is_admin()` (read every row) and `private.can_write()` (book and manage one's own rows,
true for `student` only).

What each role may do is a capability table (`CAPABILITIES` in `lib/domain/roles.ts`) that the
service, `can_edit` and the page guards read, and the two SQL functions mirror it. It is an
allow-list: a user with no profile row, or a role added later, has no capabilities until the table
and the functions grant them. Writing is therefore a student capability, not "anyone who is not an
admin": an admin is read-only everywhere, including rows they own.

Revoking admin must be immediate (a stale-JWT window is the wrong trade for a security role), and the
design should be easy to verify by test.

## Consequences
- Roles live only in the database. No role is ever read from client input; the signup trigger always
  creates `student`.
- If the system grew to many roles, many requests per second, or permission matrices, move to the hook
  pattern. The policies already go through two small functions, so the swap is local.
- Adding a role means deciding its row in `CAPABILITIES` (a compile error until then), updating the
  `CHECK` constraint, and teaching `private.is_admin()` / `private.can_write()` about it. Anything
  not granted stays denied.
