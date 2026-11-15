-- Who can see and do what with consultations (AC-2, AC-7 to AC-13; ADR 0001, 0002, 0007).
-- The rules about WHEN and HOW a consultation may be booked are in 030.
begin;
select plan(36);

-- Fixtures -------------------------------------------------------------------
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'student-a@test.local', '{"first_name": "Ada", "last_name": "Student"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002', 'student-b@test.local', '{"first_name": "Bob", "last_name": "Student"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000003', 'admin@test.local', '{"first_name": "Alex", "last_name": "Admin"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000004', 'tutor1@test.local', '{"first_name": "Tess", "last_name": "One"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000005', 'tutor2@test.local', '{"first_name": "Tom", "last_name": "Two"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000006', 'student-c@test.local', '{"first_name": "Cy", "last_name": "Student"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000007', 'no-profile@test.local');
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role = 'tutor' where id in ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005');
delete from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000007';

insert into public.consultations (id, student_id, tutor_id, reason, scheduled_at)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'a with tutor one', tests.slot(3, 10)),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'a, to be cancelled', tests.slot(4, 10)),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'b with tutor one', tests.slot(5, 10)),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'b with tutor two', tests.slot(3, 10));
update public.consultations set status = 'cancelled' where id = '22222222-2222-2222-2222-222222222222';

-- Structure -------------------------------------------------------------------
select has_table('public', 'consultations', 'consultations table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.consultations'::regclass),
  'RLS is enabled on consultations'
);
select has_index('public', 'consultations', 'consultations_student_scheduled_idx', 'a student''s list is indexed');
select has_index('public', 'consultations', 'consultations_scheduled_idx', 'the admin list is indexed');
select has_index('public', 'consultations', 'consultations_tutor_scheduled_idx', 'a tutor''s list is indexed');
select is(
  (select reloptions::text from pg_class where oid = 'public.consultation_details'::regclass),
  '{security_invoker=true}',
  'consultation_details runs with the caller''s rights, so every policy applies to it'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'consultations' and roles <> '{authenticated}'),
  0,
  'every consultations policy is scoped to the authenticated role'
);

-- Anonymous -------------------------------------------------------------------
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.consultations $$, '42501', null, 'AC-13: anon cannot read consultations');
select throws_ok($$ select * from public.consultation_details $$, '42501', null, 'AC-13: anon cannot read the consultation view');
select throws_ok($$ select * from public.tutor_busy_times('aaaaaaaa-0000-0000-0000-000000000004', now(), now() + interval '30 days') $$,
  '42501', null, 'anon cannot ask when a tutor is busy');
select tests.clear_authentication();

-- A student sees their own and nobody else's ---------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select results_eq(
  $$ select id::text from public.consultations where id::text like '%-%-%-%-%' and student_id::text like 'aaaaaaaa-%' order by id $$,
  $$ values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222') $$,
  'AC-2/AC-8: student A sees only their own consultations'
);
select results_eq(
  $$ select tutor_name from public.consultation_details where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Tess One') $$,
  'a student sees the tutor''s name on their own consultation'
);
select is(
  (select count(*)::int from public.consultation_details where student_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0,
  'AC-8: a student cannot see another student through the view either'
);
select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0,
  'a student cannot read another student''s profile'
);
select tests.clear_authentication();

-- A tutor sees what is booked with them, with the students' names -------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');
select results_eq(
  $$ select id::text from public.consultations where student_id::text like 'aaaaaaaa-%' order by id $$,
  $$ values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333') $$,
  'a tutor sees every consultation booked with them (past, cancelled and upcoming), and not the other tutor''s'
);
select results_eq(
  $$ select student_name from public.consultation_details where id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values ('Bob Student') $$,
  'a tutor sees the name of a student booked with them'
);
select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000006'),
  0,
  'a tutor cannot read the profile of a student who has not booked them'
);
select tests.clear_authentication();

-- The admin sees everything --------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.consultations where student_id::text like 'aaaaaaaa-%'),
  4,
  'AC-7: an admin sees every consultation'
);
select is(
  (select count(*)::int from public.consultation_details where student_name is not null and tutor_name is not null and student_id::text like 'aaaaaaaa-%'),
  4,
  'an admin sees both names on every consultation'
);
select tests.clear_authentication();

-- Read-only for tutors and admins (AC-12) ------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select results_eq(
  $$ with u as (update public.consultations set completed = true where id = '11111111-1111-1111-1111-111111111111' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'AC-12: an admin cannot change a consultation'
);
select throws_ok($$ delete from public.consultations where id = '11111111-1111-1111-1111-111111111111' $$, '42501', null, 'AC-12: an admin cannot delete');
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000004', 'admin booking', tests.slot(9, 10)) $$,
  '42501', null, 'AC-12: an admin cannot book, not even for themselves'
);
select tests.clear_authentication();

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');
select results_eq(
  $$ with u as (update public.consultations set completed = true where id = '11111111-1111-1111-1111-111111111111' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'a tutor cannot change a consultation booked with them'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005', 'tutor booking', tests.slot(9, 10)) $$,
  '42501', null, 'a tutor cannot book'
);
select tests.clear_authentication();

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000007');
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000004', 'no profile', tests.slot(9, 10)) $$,
  '42501', null, 'a user with no profile has no role, so cannot book'
);
select tests.clear_authentication();

-- A student writes only their own ---------------------------------------------
-- Only a consultation that has started can be marked complete (030 tests that rule), so let this one have
-- happened. The rules refuse to book the past, so switch them off for the one update.
alter table public.consultations disable trigger consultations_enforce_rules;
update public.consultations set scheduled_at = tests.slot(-3, 10) where id = '11111111-1111-1111-1111-111111111111';
alter table public.consultations enable trigger consultations_enforce_rules;
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'a new booking', tests.slot(10, 11)) $$,
  'AC-4: a student can book with a tutor'
);
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', tests.slot(10, 12)) $$,
  'the reason is optional'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'booking as someone else', tests.slot(10, 13)) $$,
  '42501', null, 'AC-9: a student cannot book on behalf of another student'
);
select lives_ok(
  $$ update public.consultations set completed = true where id = '11111111-1111-1111-1111-111111111111' $$,
  'AC-3: a student can mark their own consultation complete, once it has happened'
);
select results_eq(
  $$ with u as (update public.consultations set completed = true where id = '33333333-3333-3333-3333-333333333333' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'AC-9: a student cannot change another student''s consultation'
);
select throws_ok(
  $$ delete from public.consultations where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'a student cannot delete (cancel is a status change)'
);
select tests.clear_authentication();

-- A tutor who is demoted keeps what was booked with them ---------------------
update public.profiles set role = 'student' where id = 'aaaaaaaa-0000-0000-0000-000000000005';
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  1,
  'a student can still see the name of a former tutor they booked'
);
select tests.clear_authentication();
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000006');
select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  0,
  'a student who never booked them cannot see a former tutor'
);
select tests.clear_authentication();
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.consultations where tutor_id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  3,
  'a former tutor still sees the consultations booked with them'
);
select tests.clear_authentication();

-- Busy times: another student can see THAT a slot is taken, and nothing about it
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000006');
select ok(
  exists (
    select 1 from public.tutor_busy_times('aaaaaaaa-0000-0000-0000-000000000004', now(), now() + interval '30 days') t
    where t = tests.slot(5, 10)
  ),
  'a student can see that a tutor is busy at a slot booked by someone else'
);
select tests.clear_authentication();

-- Deleting a user removes what they booked ------------------------------------
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is_empty(
  $$ select 1 from public.consultations where student_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'deleting a user removes their consultations'
);

select * from finish();
rollback;
