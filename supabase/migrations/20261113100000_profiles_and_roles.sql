-- Profiles carry the RBAC role (ADR 0001). Access is layered: grants decide which
-- roles can touch a table at all, RLS decides which rows (ADR 0002).

-- `private` is not in the API's exposed schemas, so helpers here cannot be called via RPC.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, supabase_auth_admin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Three roles (ADR 0007): students self-register, an admin promotes a student to tutor, and
  -- admins exist only through the seed or SQL.
  role text not null default 'student' check (role in ('student', 'tutor', 'admin')),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  -- What other people see: the tutor picker, a tutor's list of students. Never the email.
  display_name text generated always as (btrim(first_name || ' ' || last_name)) stored,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user. role is never taken from client input.';
comment on column public.profiles.display_name is 'Shown to other users; never the email.';

alter table public.profiles enable row level security;

-- Be explicit instead of relying on platform default privileges (they differ between
-- local and hosted projects): users may only read profiles. No insert/update/delete
-- grant exists, so nobody can change a role through the API.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- service_role is for server-side tooling and test fixtures; the app never uses that key.
grant all on table public.profiles to service_role;

create policy "profiles: users read their own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Anyone signed in can see who the tutors are, so a student can pick one. The row holds a name and
-- a role, never an email, and other students stay private. (Policies that depend on consultations,
-- and the admin's read-all policy, are added once those exist.)
create policy "profiles: tutors are visible to everyone signed in"
  on public.profiles for select to authenticated
  using (role = 'tutor');

-- Every new auth user becomes a student. Sign-up metadata supplies the name (the sign-up form asks
-- for it) and nothing else: the role is never read from it. With no name given, the part of the email
-- before the @ is used so every profile has one.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := left(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 100);
  v_last text := left(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 100);
begin
  if v_first = '' then
    v_first := left(coalesce(nullif(btrim(split_part(new.email, '@', 1)), ''), 'User'), 100);
  end if;
  insert into public.profiles (id, first_name, last_name) values (new.id, v_first, v_last);
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
grant execute on function private.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Used by policies as `(select private.is_admin())` so Postgres evaluates it once
-- per statement (initPlan) instead of once per row. security definer lets it read
-- profiles without recursing through profiles' own RLS.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- The write capability, granted to a role by name (the mirror of CAPABILITIES in
-- lib/domain/roles.ts). It is an allow-list: a user with no profile, or a role added later,
-- cannot write until this function says they can.
create function private.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'student'
  );
$$;

revoke execute on function private.can_write() from public, anon;
grant execute on function private.can_write() to authenticated;

-- Admins can read every profile (the People screen). Defined here because it needs is_admin().
create policy "profiles: admins read everyone"
  on public.profiles for select to authenticated
  using ((select private.is_admin()));
