# ADR 0006: The database enforces state and time rules, not just the API

Status: accepted · Covers: AC-9, AC-17, AC-27, AC-28

## Context
Supabase exposes the database over REST, so any signed-in student can send
`PATCH /rest/v1/consultations?id=eq.<own>` with their own JWT and skip the app entirely. If
"cancelled is terminal" and "no times in the past" lived only in the service layer, that student
could reopen a cancelled booking, move one into the past, insert rows that are already cancelled
or complete, store whitespace-only text, or forge `created_at` / `updated_at`. The database has to
be the final authority on these rules.

## Decision
Enforce the rules where the data lives (migration `20261113100200_consultation_state_rules.sql`):

| Rule | Mechanism |
| --- | --- |
| Cancelled is terminal (AC-28) | `BEFORE UPDATE` trigger raises `23514` if `old.status = 'cancelled'` |
| No times in the past (AC-27) | Same trigger: on insert, and on update when `scheduled_at` changes |
| Only three columns are student-editable | Column-level grant: `update (scheduled_at, completed, status)` |
| New rows start scheduled and incomplete | Insert policy `with check (status = 'scheduled' and completed = false)` |
| Text is never blank (AC-17) | `CHECK (col ~ '\S')` (a regex: `btrim` would miss tabs and newlines) |

The service layer keeps its own checks. They give precise errors (`409` rather than a generic
failure) and make the common path cheap. They are not the only line of defence.

## Why a trigger and not a CHECK constraint
"In the future" depends on `now()`, which a CHECK cannot use (it must be immutable). The terminal
state compares old and new rows, which only a trigger can see.

## Consequences
- Direct REST access cannot do anything the app would refuse. `exposure.test.ts` runs the exact
  attack end to end and pgTAP (`030_state_rules.test.sql`) covers every rule, including positive
  controls so legitimate reschedule and cancel keep working.
- The trigger also applies to the service role. Fixing a cancelled row in an emergency means
  disabling the trigger deliberately, which is the intent.
- A race where two requests pass the service check at once is caught by the trigger. It surfaces as
  a generic error rather than a friendly `409`; acceptable for the volume involved.
