-- Notifications, and the admin's tools for managing tutors (ADR 0007: A4, A8, A10, A21).

-- 1. In-app notifications. A row records a fact (which tutor, which consultation time) and the app
--    words it, so wording and time zone are the app's business. Rows are written only by the database
--    functions below; a user can read their own and mark them read, nothing else.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('consultation_cancelled')),
  tutor_name text not null,
  consultation_at timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
revoke all on table public.notifications from service_role;
grant select, insert, update, delete on table public.notifications to service_role;

create policy "notifications: users read their own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: users mark their own as read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Search names with ILIKE quickly.
create extension if not exists pg_trgm with schema extensions;
create index profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- 3. The People screen: every profile with its email, searchable by name or email, filterable by role,
--    sortable, and paged. Emails live in auth.users, which the API cannot read, so this function (which
--    runs with its owner's rights) is the only way to see them, and it refuses everyone but an admin.
create function public.admin_list_people(
  p_q text default null,
  p_roles text[] default null,
  p_sort text default 'name',
  p_desc boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid, first_name text, last_name text, display_name text, email text, role text,
  upcoming bigint, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pattern text;
begin
  if not (select private.is_admin()) then
    raise exception 'only an admin can list people' using errcode = '42501';
  end if;

  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  -- The search text is data, never a pattern: escape LIKE's wildcards.
  v_pattern := case
    when nullif(btrim(p_q), '') is null then null
    else '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  select p.id, p.first_name, p.last_name, p.display_name, u.email::text, p.role,
         coalesce(t.n, 0)::bigint, count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select count(*) as n
    from public.consultations c
    where c.tutor_id = p.id and c.status = 'scheduled' and c.scheduled_at > now()
  ) t on p.role = 'tutor'
  where (p_roles is null or p.role = any (p_roles))
    and (v_pattern is null or p.display_name ilike v_pattern escape '\' or u.email ilike v_pattern escape '\')
  order by
    case when p_sort = 'name' and not p_desc then p.display_name end asc,
    case when p_sort = 'name' and p_desc then p.display_name end desc,
    case when p_sort = 'email' and not p_desc then u.email end asc,
    case when p_sort = 'email' and p_desc then u.email end desc,
    case when p_sort = 'role' and not p_desc then p.role end asc,
    case when p_sort = 'role' and p_desc then p.role end desc,
    case when p_sort = 'upcoming' and not p_desc then coalesce(t.n, 0) end asc,
    case when p_sort = 'upcoming' and p_desc then coalesce(t.n, 0) end desc,
    p.id
  limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.admin_list_people(text, text[], text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_people(text, text[], text, boolean, integer, integer) to authenticated;

-- 4. Making someone a tutor, and taking it away. Only an admin, and never on an admin.
--    Demoting a tutor who has upcoming consultations needs a choice (p_cancel_upcoming):
--      true  - cancel them, free the slots, and notify each student;
--      false - keep them scheduled (the former tutor still sees them, and cannot be booked again).
--    With no choice given the call is refused, so the app has to ask. Past consultations are untouched.
create function public.admin_set_tutor(
  p_user uuid,
  p_make_tutor boolean,
  p_cancel_upcoming boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_name text;
  v_upcoming integer;
  v_cancelled integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'only an admin can change a tutor' using errcode = '42501';
  end if;

  -- Lock the row so two admins acting together cannot interleave.
  select p.role, p.display_name into v_role, v_name from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  if v_role = 'admin' then
    raise exception 'an admin cannot be changed' using errcode = '42501';
  end if;

  if p_make_tutor then
    update public.profiles set role = 'tutor' where id = p_user and role = 'student';
    return jsonb_build_object('role', 'tutor', 'upcoming', 0, 'cancelled', 0);
  end if;

  if v_role = 'student' then
    return jsonb_build_object('role', 'student', 'upcoming', 0, 'cancelled', 0);
  end if;

  select count(*) into v_upcoming
  from public.consultations c
  where c.tutor_id = p_user and c.status = 'scheduled' and c.scheduled_at > now();

  if v_upcoming > 0 and p_cancel_upcoming is null then
    raise exception 'this tutor has % upcoming consultations: choose to cancel them or keep them', v_upcoming
      using errcode = '23514', hint = 'choose_cancel_or_keep';
  end if;

  if p_cancel_upcoming then
    with cancelled as (
      update public.consultations c
      set status = 'cancelled'
      where c.tutor_id = p_user and c.status = 'scheduled' and c.scheduled_at > now()
      returning c.student_id, c.scheduled_at
    )
    insert into public.notifications (user_id, kind, tutor_name, consultation_at)
    select student_id, 'consultation_cancelled', v_name, scheduled_at from cancelled;
    get diagnostics v_cancelled = row_count;
  end if;

  update public.profiles set role = 'student' where id = p_user;
  return jsonb_build_object('role', 'student', 'upcoming', v_upcoming, 'cancelled', v_cancelled);
end;
$$;

revoke execute on function public.admin_set_tutor(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_tutor(uuid, boolean, boolean) to authenticated;
