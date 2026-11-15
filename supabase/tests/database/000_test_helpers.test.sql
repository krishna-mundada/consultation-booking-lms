-- Test helpers for the pgTAP suites. Runs first (alphabetical) and is committed
-- (no rollback) so the later files can use it. Lives in the `tests` schema, which
-- only exists in the local test database and is never created by a migration.
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- Creates an auth user. The signup trigger creates the matching profile.
create or replace function tests.create_user(p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql
as $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_email, p_meta);
  return p_id;
end;
$$;

-- Acts as the given user from now until the end of the transaction.
create or replace function tests.authenticate_as(p_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end;
$$;

-- Back to the superuser used by the test runner.
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

-- The next (or, for a negative count, previous) weekday at a Melbourne wall-clock time, as an instant:
-- consultations only exist on business-day slots. Use at least 2 days ahead so the one-hour notice
-- rule is never in the way.
create or replace function tests.slot(p_days integer, p_hour integer default 10, p_minute integer default 0)
returns timestamptz
language plpgsql
as $$
declare
  v_day date := (now() at time zone 'Australia/Melbourne')::date + p_days;
begin
  while extract(isodow from v_day) > 5 loop
    v_day := v_day + case when p_days >= 0 then 1 else -1 end;
  end loop;
  return (v_day + make_time(p_hour, p_minute, 0)) at time zone 'Australia/Melbourne';
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

create extension if not exists pgtap with schema extensions;
begin;
select plan(1);
select has_schema('tests', 'test helpers are installed');
select * from finish();
rollback;
