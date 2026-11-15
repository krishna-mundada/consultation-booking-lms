-- LOCAL DEVELOPMENT ONLY. Creates one admin, two tutors and three students you can log in as, with
-- a few consultations and one notification. Never run this against a hosted project: the passwords
-- are public. (On a hosted project the README shows how to make the first admin.)
--
--   admin@example.com     / admin-password-123    admin   Alex Morgan
--   tutor1@example.com    / tutor-password-123    tutor   Maya Chen
--   tutor2@example.com    / tutor-password-123    tutor   Jordan Reyes
--   student@example.com   / student-password-123  student Sam Taylor
--   student2@example.com  / student-password-123  student Priya Nair
--   student3@example.com  / student-password-123  student Liam Walsh
--
-- Every sign-up is a student (ADR 0007); the rows below are promoted here, in SQL, exactly as a
-- hosted project's first admin would be.

-- The next (or previous) weekday at a given Melbourne time, as an instant: consultations only exist on
-- business-day slots.
create function pg_temp.business_slot(p_days integer, p_hour integer, p_minute integer)
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

do $$
declare
  admin_id uuid := '5eed0000-0000-0000-0000-0000000000a1';
  tutor1_id uuid := '5eed0000-0000-0000-0000-0000000000a2';
  tutor2_id uuid := '5eed0000-0000-0000-0000-0000000000a3';
  sam_id uuid := '5eed0000-0000-0000-0000-0000000000b1';
  priya_id uuid := '5eed0000-0000-0000-0000-0000000000b2';
  liam_id uuid := '5eed0000-0000-0000-0000-0000000000b3';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
         v.email, extensions.crypt(v.password, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('first_name', v.first_name, 'last_name', v.last_name),
         now(), now(), '', '', '', ''
  from (values
    (admin_id,  'admin@example.com',    'admin-password-123',   'Alex',   'Morgan'),
    (tutor1_id, 'tutor1@example.com',   'tutor-password-123',   'Maya',   'Chen'),
    (tutor2_id, 'tutor2@example.com',   'tutor-password-123',   'Jordan', 'Reyes'),
    (sam_id,    'student@example.com',  'student-password-123', 'Sam',    'Taylor'),
    (priya_id,  'student2@example.com', 'student-password-123', 'Priya',  'Nair'),
    (liam_id,   'student3@example.com', 'student-password-123', 'Liam',   'Walsh')
  ) as v (id, email, password, first_name, last_name);

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text, 'email',
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         now(), now(), now()
  from auth.users u
  where u.id in (admin_id, tutor1_id, tutor2_id, sam_id, priya_id, liam_id);

  -- The sign-up trigger made everyone a student; promote.
  update public.profiles set role = 'admin' where id = admin_id;
  update public.profiles set role = 'tutor' where id in (tutor1_id, tutor2_id);

  insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
  values
    (sam_id,   tutor1_id, 'Choosing Year 12 subjects',     pg_temp.business_slot(3, 10, 0)),
    (sam_id,   tutor2_id, 'Exam preparation strategy',     pg_temp.business_slot(7, 14, 30)),
    (sam_id,   tutor1_id, null,                            pg_temp.business_slot(5, 9, 30)),
    (priya_id, tutor1_id, 'Help planning my study timetable', pg_temp.business_slot(4, 11, 0)),
    (liam_id,  tutor2_id, 'Uni preferences and ATAR',      pg_temp.business_slot(5, 15, 30));

  -- One cancelled, to show how that reads in the lists.
  update public.consultations set status = 'cancelled'
  where student_id = priya_id and tutor_id = tutor1_id;
  insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
  values (priya_id, tutor2_id, 'Essay structure', pg_temp.business_slot(6, 13, 0));
  update public.consultations set status = 'cancelled'
  where student_id = priya_id and tutor_id = tutor2_id;

  -- A consultation in the past (completed). The rules refuse to book the past, so switch the rule off
  -- for this one row only.
  alter table public.consultations disable trigger consultations_enforce_rules;
  insert into public.consultations (student_id, tutor_id, reason, scheduled_at, completed)
  values (sam_id, tutor1_id, 'Maths methods revision', pg_temp.business_slot(-9, 10, 0), true);
  alter table public.consultations enable trigger consultations_enforce_rules;

  -- One unread notification, so the banner has something to show.
  insert into public.notifications (user_id, kind, tutor_name, consultation_at)
  values (sam_id, 'consultation_cancelled', 'Jordan Reyes', pg_temp.business_slot(8, 16, 0));
end $$;
