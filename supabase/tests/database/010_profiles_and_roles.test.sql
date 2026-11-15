-- AC-11 (nobody can grant themselves a role), AC-12 (no write path through the app),
-- AC-14 (RBAC justified; see ADR 0001, 0002, 0007).
begin;
select plan(27);

-- Fixtures -------------------------------------------------------------------
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'student@test.local', '{"first_name": "Ada", "last_name": "Lovelace"}'::jsonb);
-- Attempts to smuggle a role through sign-up metadata:
select tests.create_user(
  'aaaaaaaa-0000-0000-0000-000000000002', 'sneaky@test.local',
  '{"role": "admin", "user_role": "admin", "first_name": "Sneaky"}'::jsonb
);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000003', 'admin@test.local');
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000004', 'tutor@test.local', '{"first_name": "Tess", "last_name": "Tutor"}'::jsonb);
update public.profiles set role = 'tutor' where id = 'aaaaaaaa-0000-0000-0000-000000000004';
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000005', 'other@test.local');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000006', 'long@test.local',
  jsonb_build_object('first_name', repeat('x', 300), 'last_name', repeat('y', 300)));

-- Structure -------------------------------------------------------------------
select has_table('public', 'profiles', 'profiles table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);
select throws_ok(
  $$ insert into public.profiles (id, role, first_name) values ('aaaaaaaa-0000-0000-0000-0000000000ff', 'owner', 'X') $$,
  '23514', null, 'only student, tutor and admin are roles'
);
select has_function('private', 'is_admin', 'private.is_admin() exists in the non-exposed private schema');
select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_admin'),
  true,
  'is_admin is security definer'
);
select ok(
  coalesce(
    (select 'search_path=""' = any (p.proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'is_admin'),
    false
  ),
  'is_admin pins an empty search_path'
);
select ok(
  coalesce(
    (select 'search_path=""' = any (p.proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'handle_new_user'),
    false
  ),
  'handle_new_user (security definer) pins an empty search_path'
);

-- Function execute privileges (ADR 0001/0002): only what must be callable is callable.
select ok(
  not has_function_privilege('anon', 'private.is_admin()', 'execute'),
  'anon cannot execute private.is_admin()'
);
select ok(
  has_function_privilege('authenticated', 'private.is_admin()', 'execute'),
  'authenticated can execute private.is_admin() (policies call it)'
);
select ok(
  not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute')
    and not has_function_privilege('anon', 'private.handle_new_user()', 'execute'),
  'nobody but the Auth service can execute the sign-up trigger function'
);
select ok(
  not has_function_privilege('authenticated', 'private.enforce_consultation_rules()', 'execute')
    and not has_function_privilege('authenticated', 'private.set_updated_at()', 'execute'),
  'the trigger-only functions cannot be executed by authenticated users'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT')
    and has_table_privilege('service_role', 'public.profiles', 'UPDATE'),
  'service_role can administer profiles (server-side tooling and test fixtures; the app never uses this key)'
);

-- Sign-up trigger (AC-11) -----------------------------------------------------
select is(
  (select role from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'student',
  'a new user gets a student profile'
);
select is(
  (select role from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'student',
  'role in sign-up metadata is ignored: still student'
);
select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Ada Lovelace',
  'the name from sign-up becomes the display name'
);
select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  'other',
  'with no name given, the part of the email before the @ is used'
);
select is(
  (select char_length(first_name) || '/' || char_length(last_name) from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000006'),
  '100/100',
  'over-long names are cut to 100 characters instead of failing the sign-up'
);

-- As a student ----------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');

select results_eq(
  $$ select id::text from public.profiles where id::text like 'aaaaaaaa-%' order by id $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001'), ('aaaaaaaa-0000-0000-0000-000000000004') $$,
  'a student sees their own profile and the tutors, and no other student, no admin'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'AC-11: a student cannot promote themselves (no update grant)'
);
select throws_ok(
  $$ update public.profiles set role = 'tutor' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'AC-11: a student cannot make themselves a tutor either'
);
select throws_ok(
  $$ insert into public.profiles (id, role, first_name) values (gen_random_uuid(), 'admin', 'X') $$,
  '42501', null, 'AC-11: a student cannot insert profiles'
);
select throws_ok(
  $$ delete from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'a student cannot delete profiles'
);
select tests.clear_authentication();

-- As a tutor ------------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');
select results_eq(
  $$ select id::text from public.profiles where id::text like 'aaaaaaaa-%' order by id $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000004') $$,
  'a tutor sees the tutors (themselves) and nobody else until a student has booked them'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000004' $$,
  '42501', null, 'a tutor cannot change any role'
);
select tests.clear_authentication();

-- Anonymous -------------------------------------------------------------------
select tests.authenticate_as_anon();
select throws_ok(
  $$ select * from public.profiles $$,
  '42501', null, 'anon has no access to profiles'
);
select tests.clear_authentication();

-- As an admin -----------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.profiles where id::text like 'aaaaaaaa-%'),
  6,
  'an admin can read every profile'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'AC-12: even an admin cannot change roles directly (only through admin_set_tutor)'
);
select tests.clear_authentication();

select * from finish();
rollback;
