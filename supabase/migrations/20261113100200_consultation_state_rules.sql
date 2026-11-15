-- The database enforces the consultation rules itself (ADR 0006). The API checks them too and
-- gives friendlier errors, but a signed-in user can call Supabase's REST API directly with their
-- own JWT, so nothing may depend on the API being the only way in.

-- 1. Text must contain something other than whitespace (\S = any non-whitespace character).
--    Added NOT VALID and then validated: on a table that already holds rows this takes only a
--    brief lock to add the constraint, and a row that violates it fails the VALIDATE step with
--    a clear error instead of failing a long exclusive-lock ALTER.
alter table public.consultations
  add constraint consultations_reason_not_blank check (reason is null or reason ~ '\S') not valid;
alter table public.consultations validate constraint consultations_reason_not_blank;

-- 2. When a consultation may be booked, moved or changed (ADR 0007: A11 to A17), and who it may be with.
--    Raised as check_violation (23514) so they surface like any other constraint.
create function private.enforce_consultation_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  business_zone constant text := 'Australia/Melbourne';
  v_local timestamp;
begin
  -- A time that is being set (a new booking, or a reschedule) has to be one that can be booked:
  -- at least an hour away, at most eight weeks ahead, in business hours (weekdays 9:00 to 16:30
  -- slot starts, Melbourne time). The half-hour grid itself is a CHECK on the column.
  if tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at then
    if new.scheduled_at < now() + interval '1 hour' then
      raise exception 'a consultation must be at least an hour from now' using errcode = '23514';
    end if;
    if new.scheduled_at > now() + interval '56 days' then
      raise exception 'a consultation cannot be more than eight weeks ahead' using errcode = '23514';
    end if;
    v_local := new.scheduled_at at time zone business_zone;
    if extract(isodow from v_local) > 5 or v_local::time < time '09:00' or v_local::time > time '16:30' then
      raise exception 'a consultation must be on a weekday between 9:00 and 17:00 (Melbourne time)'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- A consultation is with a tutor.
    if not exists (select 1 from public.profiles p where p.id = new.tutor_id and p.role = 'tutor') then
      raise exception 'tutor_id must be a tutor' using errcode = '23514';
    end if;
  else
    -- Cancelled is terminal: nothing about a cancelled consultation may change.
    if old.status = 'cancelled' then
      raise exception 'a cancelled consultation cannot be changed' using errcode = '23514';
    end if;
    -- Once it has started a consultation is history: it can no longer be moved or cancelled. Only
    -- the completed tick can still be changed.
    if old.scheduled_at <= now()
       and (new.status is distinct from old.status or new.scheduled_at is distinct from old.scheduled_at) then
      raise exception 'a consultation that has started can no longer be moved or cancelled'
        using errcode = '23514';
    end if;
    -- Completed means it happened: it can be ticked only once the consultation has started. (Leaving it
    -- unticked, or unticking one that was ticked, is always fine.)
    if new.completed and not old.completed and new.scheduled_at > now() then
      raise exception 'a consultation can only be marked complete once it has started' using errcode = '23514';
    end if;
    -- Cancelling changes the status and nothing else.
    if new.status = 'cancelled'
       and (new.completed is distinct from old.completed or new.scheduled_at is distinct from old.scheduled_at) then
      raise exception 'cancelling a consultation cannot change anything else' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_consultation_rules() from public, anon, authenticated;

-- Named so it fires before consultations_set_updated_at (triggers run alphabetically).
create trigger consultations_enforce_rules
  before insert or update on public.consultations
  for each row execute function private.enforce_consultation_rules();

-- 3. Only the three columns a student legitimately changes can be updated. Everything else
--    (tutor, reason, ids, timestamps) is fixed once booked.
revoke update on table public.consultations from authenticated;
grant update (scheduled_at, completed, status) on table public.consultations to authenticated;

-- 4. New rows always start scheduled and incomplete.
drop policy "consultations: insert own" on public.consultations;
create policy "consultations: insert own"
  on public.consultations for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select private.can_write())
    and status = 'scheduled'
    and completed = false
  );

-- 5. A student can only supply the four fields of a booking. id, status, completed, created_at
--    and updated_at are set by the database (defaults), so none can be forged on insert.
revoke insert on table public.consultations from authenticated;
grant insert (student_id, tutor_id, reason, scheduled_at)
  on table public.consultations to authenticated;

-- 6. service_role (server-side tooling and test fixtures; the app never uses that key) gets the
--    data privileges it needs, not TRUNCATE, TRIGGER or REFERENCES.
revoke all on table public.consultations from service_role;
grant select, insert, update, delete on table public.consultations to service_role;
revoke all on table public.profiles from service_role;
grant select, insert, update, delete on table public.profiles to service_role;
