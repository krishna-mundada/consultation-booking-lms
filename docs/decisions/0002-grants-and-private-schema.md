# ADR 0002: Explicit grants, a `private` schema for helpers, no default exposure

Status: accepted · Covers: AC-9, AC-11, AC-12, AC-25

## Context
Supabase describes two layers: grants decide whether a role can touch an object at all, and RLS
decides which rows. By default on existing projects new `public` tables and functions are
granted to `anon`, `authenticated` and `service_role`, and Supabase says exposure should become opt-in.
RLS does not apply to functions, so access to them is controlled only by `EXECUTE` grants.
([Securing your API](https://supabase.com/docs/guides/api/securing-your-api))

## Decision
1. Set `auto_expose_new_tables = false` in `supabase/config.toml` so nothing is exposed implicitly.
2. In the same migration as each table, grant only what the app needs to `authenticated`:
   - `profiles`: `select`
   - `consultations`: `select, insert, update` (no `delete`; cancel is a soft state)
   - nothing to `anon`.
3. Put helper functions (`is_admin`) in a `private` schema that is not in the API's exposed schemas, so
   they cannot be called over RPC. `authenticated` gets `USAGE` on the schema and `EXECUTE` on the
   function only so policies can call it.
4. Pin `set search_path = ''` on every `security definer` function.
5. Policies always say `to authenticated` (stops evaluation for `anon`, a documented perf win).

6. `service_role` is granted full access to both tables. With exposure opt-in it has no implicit
   access, and server-side tooling (promoting an admin) and test fixtures need it. The running app
   never uses that key. Found when the integration fixtures failed with "permission denied for
   table profiles"; pinned by a pgTAP assertion.

## Why it matters here
A missing grant is a second wall: even a mistakenly added delete policy or admin write policy would
fail at the grant. pgTAP tests assert grants and policies separately.

## Consequences
Slightly more migration SQL. The service-role key is never used by the app at runtime; tests use it
only to create fixture users.
