-- Consultations (AC-2..AC-9, AC-12, AC-18, AC-25).
-- scheduled_at is a UTC instant. status and completed are independent (docs/conventions.md C1, C2).

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  -- Who the consultation is with: a profile with the admin role (enforced by a trigger, since a
  -- foreign key cannot test a role). A tutor with consultations cannot be deleted.
  tutor_id uuid not null references public.profiles (id) on delete restrict,
  -- Optional free text (ADR 0007).
  reason text check (reason is null or char_length(reason) between 1 and 1000),
  -- A UTC instant on the half hour: bookings are 30-minute slots, so "the same time" has one meaning.
  scheduled_at timestamptz not null
    check (
      extract(minute from scheduled_at at time zone 'UTC') in (0, 30)
      and extract(second from scheduled_at at time zone 'UTC') = 0
    ),
  -- 'cancelled' is terminal and soft: history is kept and admins still see it.
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes match the two list queries: a student's own rows by time, and all rows by time.
create index consultations_student_scheduled_idx
  on public.consultations (student_id, scheduled_at, id);
create index consultations_scheduled_idx
  on public.consultations (scheduled_at, id);

-- No double booking: a tutor has one scheduled consultation per slot, however many students ask at
-- once. The database decides the race; the app turns the violation into "that slot was just taken".
-- A cancelled consultation frees its slot, and the same index serves the tutor's busy-times lookup.
create unique index consultations_tutor_slot_key
  on public.consultations (tutor_id, scheduled_at)
  where status = 'scheduled';

-- A student cannot be in two places at once: one scheduled consultation per student per slot.
create unique index consultations_student_slot_key
  on public.consultations (student_id, scheduled_at)
  where status = 'scheduled';

-- A tutor's own list, and the policies that look consultations up by tutor.
create index consultations_tutor_scheduled_idx
  on public.consultations (tutor_id, scheduled_at, id);

-- When is this tutor busy? Students cannot read each other's consultations, so this function (which
-- runs with the owner's rights) returns only the busy instants: no reason, no student. It is in the
-- public schema because the API calls it; callers must be signed in.
create function public.tutor_busy_times(p_tutor uuid, p_from timestamptz, p_to timestamptz)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select c.scheduled_at
  from public.consultations c
  where c.tutor_id = p_tutor
    and c.status = 'scheduled'
    and c.scheduled_at >= p_from
    and c.scheduled_at < least(p_to, p_from + interval '35 days')
  order by c.scheduled_at;
$$;

revoke execute on function public.tutor_busy_times(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.tutor_busy_times(uuid, timestamptz, timestamptz) to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger consultations_set_updated_at
  before update on public.consultations
  for each row execute function private.set_updated_at();

alter table public.consultations enable row level security;

-- Least privilege: no delete (cancel is a status change), nothing for anon.
revoke all on table public.consultations from anon, authenticated;
grant select, insert, update on table public.consultations to authenticated;
-- service_role is for server-side tooling and test fixtures; the app never uses that key.
grant all on table public.consultations to service_role;

-- Reading: everyone sees their own rows (admins additionally see all, below).
create policy "consultations: read own"
  on public.consultations for select to authenticated
  using (student_id = (select auth.uid()));

-- Writing is a student capability: admins are read-only everywhere, including their own rows.
create policy "consultations: insert own"
  on public.consultations for insert to authenticated
  with check (student_id = (select auth.uid()) and (select private.can_write()));

create policy "consultations: update own"
  on public.consultations for update to authenticated
  using (student_id = (select auth.uid()) and (select private.can_write()))
  with check (student_id = (select auth.uid()) and (select private.can_write()));

-- Admins: read-only visibility across all rows. There is deliberately no admin write policy.
create policy "consultations: admins read all"
  on public.consultations for select to authenticated
  using ((select private.is_admin()));

-- A tutor sees every consultation booked with them. The test is the consultation's tutor, not the
-- person's current role, so someone who was demoted still sees the sessions they have yet to give.
create policy "consultations: tutors read the ones booked with them"
  on public.consultations for select to authenticated
  using (tutor_id = (select auth.uid()));

-- Names travel with consultations. A student sees the name of every tutor they have booked (even one
-- who has since stopped being a tutor), and a tutor sees the name of every student booked with them,
-- and nobody else's.
create policy "profiles: the tutors a student has booked"
  on public.profiles for select to authenticated
  using (exists (
    select 1 from public.consultations c
    where c.tutor_id = profiles.id and c.student_id = (select auth.uid())
  ));

create policy "profiles: the students booked with a tutor"
  on public.profiles for select to authenticated
  using (exists (
    select 1 from public.consultations c
    where c.student_id = profiles.id and c.tutor_id = (select auth.uid())
  ));

-- One row per consultation with both names, so a list can search and sort by tutor or student name.
-- security_invoker makes it run with the caller's rights: every consultation and profile policy above
-- applies, so a student gets their own rows, a tutor theirs, and an admin everything.
create view public.consultation_details
with (security_invoker = true) as
  select
    c.id, c.student_id, c.tutor_id, c.reason, c.scheduled_at, c.status, c.completed,
    c.created_at, c.updated_at,
    t.display_name as tutor_name,
    s.display_name as student_name
  from public.consultations c
  left join public.profiles t on t.id = c.tutor_id
  left join public.profiles s on s.id = c.student_id;

revoke all on public.consultation_details from anon, authenticated;
grant select on public.consultation_details to authenticated;
grant select on public.consultation_details to service_role;
