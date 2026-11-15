-- The admin's tools: the People list, and promoting and demoting tutors (with the cancel-or-keep
-- choice), plus the notifications that choice creates (ADR 0007: A4, A8, A10, A21).
begin;
select plan(46);

-- Fixtures -------------------------------------------------------------------
-- Every fixture email is on pgtap.invalid and every list below searches for that, so the results do not
-- depend on whatever else is in the database (seed users, users the other test suites created).
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'student-a@pgtap.invalid', '{"first_name": "Ada", "last_name": "Alpha"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002', 'student-b@pgtap.invalid', '{"first_name": "Bob", "last_name": "Beta"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000003', 'admin@pgtap.invalid', '{"first_name": "Alex", "last_name": "Admin"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000004', 'tutor1@pgtap.invalid', '{"first_name": "Tess", "last_name": "One"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000005', 'tutor2@pgtap.invalid', '{"first_name": "Tom", "last_name": "Two"}'::jsonb);
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000006', 'student-c@pgtap.invalid', '{"first_name": "Cy", "last_name": "Gamma"}'::jsonb);
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role = 'tutor' where id in ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005');

insert into public.consultations (id, student_id, tutor_id, reason, scheduled_at)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'a with tutor one', tests.slot(3, 10)),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'b with tutor one', tests.slot(4, 10)),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'b, cancelled', tests.slot(5, 10)),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'a with tutor two', tests.slot(6, 11));
update public.consultations set status = 'cancelled' where id = '33333333-3333-3333-3333-333333333333';

alter table public.consultations disable trigger consultations_enforce_rules;
insert into public.consultations (id, student_id, tutor_id, reason, scheduled_at)
values ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'history', tests.slot(-3, 10));
alter table public.consultations enable trigger consultations_enforce_rules;

-- Only an admin can use the admin functions ----------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select * from public.admin_list_people() $$, '42501', null, 'a student cannot list people');
select throws_ok($$ select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000006', true) $$, '42501', null, 'a student cannot make anyone a tutor');
select tests.clear_authentication();
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000004');
select throws_ok($$ select * from public.admin_list_people() $$, '42501', null, 'a tutor cannot list people');
select throws_ok($$ select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000006', true) $$, '42501', null, 'a tutor cannot make anyone a tutor');
select tests.clear_authentication();
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.admin_list_people() $$, '42501', null, 'anon cannot list people');
select throws_ok($$ select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000006', true) $$, '42501', null, 'anon cannot make anyone a tutor');
select tests.clear_authentication();

-- The People list --------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.admin_list_people('pgtap.invalid')),
  6,
  'the list returns every matching person, with the match counted'
);
select is(
  (select total from public.admin_list_people('pgtap.invalid') limit 1),
  6::bigint,
  'each row carries the total number of matches'
);
select is(
  (select email from public.admin_list_people('tutor2@pgtap.invalid')),
  'tutor2@pgtap.invalid',
  'an admin sees the email, found by searching for it'
);
select is(
  (select display_name from public.admin_list_people('tess')),
  'Tess One',
  'search by name is case-insensitive'
);
select is((select count(*)::int from public.admin_list_people('%')), 0, 'a % in the search is text, not a wildcard');
select is((select count(*)::int from public.admin_list_people('_')), 0, 'an underscore in the search is text, not a wildcard');
select is((select count(*)::int from public.admin_list_people('x'' or ''1''=''1')), 0, 'quotes in the search are just text');
select results_eq(
  $$ select display_name from public.admin_list_people('pgtap.invalid', array['tutor']) order by display_name $$,
  $$ values ('Tess One'), ('Tom Two') $$,
  'the role filter narrows the list'
);
select results_eq(
  $$ select display_name from public.admin_list_people('pgtap.invalid', null, 'name', false, 2, 0) $$,
  $$ values ('Ada Alpha'), ('Alex Admin') $$,
  'the list sorts by name and pages: the first page'
);
select results_eq(
  $$ select display_name from public.admin_list_people('pgtap.invalid', null, 'name', false, 2, 2) $$,
  $$ values ('Bob Beta'), ('Cy Gamma') $$,
  'the second page continues where the first stopped'
);
select is(
  (select display_name from public.admin_list_people('pgtap.invalid', null, 'name', true, 1, 0)),
  'Tom Two',
  'sorting descending reverses the order'
);
select is(
  (select display_name from public.admin_list_people('pgtap.invalid', null, 'upcoming', true, 1, 0)),
  'Tess One',
  'sorting by upcoming puts the busiest tutor first'
);
select results_eq(
  $$ select display_name, upcoming from public.admin_list_people('pgtap.invalid', array['tutor'], 'name') order by display_name $$,
  $$ values ('Tess One', 2::bigint), ('Tom Two', 1::bigint) $$,
  'upcoming counts scheduled consultations ahead, not cancelled or past ones'
);
select is(
  (select count(*)::int from public.admin_list_people('pgtap.invalid', null, 'name', false, 1000, 0)),
  6,
  'an oversized page is capped, not refused'
);
select tests.clear_authentication();

-- Making someone a tutor -------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select is(
  (select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000006', true) ->> 'role'),
  'tutor',
  'an admin can make a student a tutor'
);
select is(
  (select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000006', true) ->> 'role'),
  'tutor',
  'doing it again changes nothing'
);
select throws_ok(
  $$ select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000003', false) $$,
  '42501', null, 'an admin cannot be changed, not even by themselves'
);
select throws_ok(
  $$ select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-0000000000aa', true) $$,
  'P0002', null, 'a user that does not exist is an error'
);
select tests.clear_authentication();
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000006', 'with the new tutor', tests.slot(8, 10)) $$,
  'the new tutor can now be booked'
);

-- Demoting a tutor ---------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select throws_ok(
  $$ select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000004', false) $$,
  '23514', null, 'demoting a tutor who has upcoming consultations needs a choice'
);
select is(
  (select role from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'tutor',
  'and nothing changed while the choice is pending'
);

-- Keep: the tutor leaves the list, the consultations stay.
select is(
  (select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000005', false, false) ->> 'role'),
  'student',
  'choosing to keep demotes the tutor'
);
select is(
  (select status from public.consultations where id = '44444444-4444-4444-4444-444444444444'),
  'scheduled',
  'and keeps their upcoming consultation scheduled'
);
select is(
  (select count(*)::int from public.notifications where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'and notifies nobody'
);

-- Cancel: the consultations are cancelled and each student is told.
select is(
  (select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000004', false, true) ->> 'cancelled'),
  '2',
  'choosing to cancel reports how many consultations it cancelled'
);
select results_eq(
  $$ select id::text, status from public.consultations where tutor_id = 'aaaaaaaa-0000-0000-0000-000000000004' order by id $$,
  $$ values ('11111111-1111-1111-1111-111111111111', 'cancelled'),
            ('22222222-2222-2222-2222-222222222222', 'cancelled'),
            ('33333333-3333-3333-3333-333333333333', 'cancelled'),
            ('55555555-5555-5555-5555-555555555555', 'scheduled') $$,
  'the upcoming ones are cancelled; the past one and the already-cancelled one are untouched'
);
select tests.clear_authentication();

select is(
  (select count(*)::int from public.notifications where kind = 'consultation_cancelled' and tutor_name = 'Tess One'),
  2,
  'one notification per cancelled consultation'
);
select is(
  (select count(*)::int from public.notifications where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and tutor_name = 'Tess One'),
  1,
  'each student is told about their own'
);
select is(
  (select role from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'student',
  'the tutor is a student again'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000004', 'booking a former tutor', tests.slot(9, 10)) $$,
  '23514', 'tutor_id must be a tutor', 'a former tutor cannot be booked'
);

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select is(
  (select public.admin_set_tutor('aaaaaaaa-0000-0000-0000-000000000004', false) ->> 'role'),
  'student',
  'demoting someone who is already a student is a no-op'
);
select tests.clear_authentication();

-- Notifications ------------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notifications), 1, 'a student sees only their own notifications');
select throws_ok(
  $$ insert into public.notifications (user_id, kind, tutor_name, consultation_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'consultation_cancelled', 'Forged', now()) $$,
  '42501', null, 'a user cannot write notifications'
);
select throws_ok(
  $$ update public.notifications set tutor_name = 'Mallory' $$,
  '42501', null, 'a user can change nothing on a notification but whether it is read'
);
select lives_ok(
  $$ update public.notifications set read_at = now() $$,
  'a user can mark their own notification read'
);
select is((select count(*)::int from public.notifications where read_at is not null), 1, 'and it stays read');
select tests.clear_authentication();

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  $$ with u as (update public.notifications set read_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'a user cannot touch another user''s notification'
);
select tests.clear_authentication();

select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003');
select is((select count(*)::int from public.notifications where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'not even an admin reads other people''s notifications');
select tests.clear_authentication();

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.notifications $$, '42501', null, 'anon cannot read notifications');
select tests.clear_authentication();

delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.notifications where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'deleting a user removes their notifications'
);

select * from finish();
rollback;
