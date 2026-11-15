-- When and how a consultation may be booked, moved or changed, enforced IN THE DATABASE
-- (AC-9, AC-17, AC-27, AC-28; ADR 0006, 0007: A11 to A17). The API checks these too, but a signed-in
-- student can call Supabase's REST API directly with their own JWT, so the database must hold the line.
begin;
select plan(49);

-- Fixtures -------------------------------------------------------------------
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'student-a@test.local');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002', 'student-b@test.local');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000003', 'admin@test.local');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000004', 'tutor1@test.local');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000005', 'tutor2@test.local');
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role = 'tutor' where id in ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005');

insert into public.consultations (id, student_id, tutor_id, reason, scheduled_at)
values
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'to reschedule', tests.slot(3, 10)),
  ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'to cancel', tests.slot(4, 10)),
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'already cancelled', tests.slot(5, 10));
update public.consultations set status = 'cancelled' where id = '66666666-6666-6666-6666-666666666666';

-- A consultation in the past. The rules refuse to book the past, so switch them off for this one row.
alter table public.consultations disable trigger consultations_enforce_rules;
insert into public.consultations (id, student_id, tutor_id, reason, scheduled_at)
values ('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'history', tests.slot(-3, 10));
alter table public.consultations enable trigger consultations_enforce_rules;

-- The reason (AC-17) ----------------------------------------------------------
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', tests.slot(20, 10)) $$,
  'a reason is optional'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', '', tests.slot(21, 10)) $$,
  '23514', null, 'an empty reason is rejected'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', E'\t \n', tests.slot(21, 10)) $$,
  '23514', null, 'AC-17: a whitespace-only reason is rejected by the database'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', repeat('x', 1001), tests.slot(21, 10)) $$,
  '23514', null, 'an over-long reason is rejected'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at, status)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'x', tests.slot(21, 10), 'archived') $$,
  '23514', null, 'an unknown status is rejected'
);

-- The slot grid ---------------------------------------------------------------
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'x', tests.slot(21, 10, 15)) $$,
  '23514', null, 'a time that is not on the half hour is rejected'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'x', tests.slot(21, 10) + interval '30 seconds') $$,
  '23514', null, 'a time with seconds is rejected'
);

-- When a consultation can be booked (A11, A13) --------------------------------
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'first slot of the day', tests.slot(22, 9, 0)) $$,
  '9:00 is bookable'
);
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'last slot of the day', tests.slot(22, 16, 30)) $$,
  '16:30 (the last half hour before 17:00) is bookable'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'too early', tests.slot(23, 8, 30)) $$,
  '23514', 'a consultation must be on a weekday between 9:00 and 17:00 (Melbourne time)', 'before 9:00 is rejected'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'too late', tests.slot(23, 17, 0)) $$,
  '23514', 'a consultation must be on a weekday between 9:00 and 17:00 (Melbourne time)', '17:00 is rejected: the day ends then'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'weekend',
       (((now() at time zone 'Australia/Melbourne')::date + 14 + ((6 - extract(isodow from (now() at time zone 'Australia/Melbourne')::date + 14)::int + 7) % 7)) + time '10:00') at time zone 'Australia/Melbourne') $$,
  '23514', 'a consultation must be on a weekday between 9:00 and 17:00 (Melbourne time)', 'a Saturday is rejected'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'now',
       to_timestamp(floor(extract(epoch from now()) / 1800) * 1800)) $$,
  '23514', 'a consultation must be at least an hour from now', 'AC-27: a time less than an hour away (or past) is rejected'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'too far', tests.slot(60, 10)) $$,
  '23514', 'a consultation cannot be more than eight weeks ahead', 'more than eight weeks ahead is rejected'
);

-- Who a consultation can be with ----------------------------------------------
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'x', tests.slot(24, 10)) $$,
  '23514', 'tutor_id must be a tutor', 'a student is not a tutor'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'x', tests.slot(24, 10)) $$,
  '23514', 'tutor_id must be a tutor', 'an admin is not a tutor'
);

-- One booking per slot (A14) ---------------------------------------------------
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'same slot, other student', tests.slot(3, 10)) $$,
  '23505', null, 'a tutor cannot be booked twice for the same slot, even by a different student'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'same time, other tutor', tests.slot(3, 10)) $$,
  '23505', null, 'a student cannot hold two consultations at the same time, even with different tutors'
);
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'other student, other tutor', tests.slot(3, 10)) $$,
  'two different students can hold the same time with two different tutors'
);
select lives_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'slot freed by a cancellation', tests.slot(5, 10)) $$,
  'a cancelled consultation frees its slot'
);

-- Moving a consultation --------------------------------------------------------
select lives_ok(
  $$ update public.consultations set scheduled_at = tests.slot(7, 10) where id = '44444444-4444-4444-4444-444444444444' $$,
  'AC-5: a scheduled consultation can be moved to another bookable slot'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = tests.slot(7, 10, 15) where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, 'a consultation cannot be moved off the grid'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = tests.slot(5, 10) where id = '44444444-4444-4444-4444-444444444444' $$,
  '23505', null, 'a consultation cannot be moved onto a slot the tutor already has'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = tests.slot(7, 18) where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, 'a consultation cannot be moved outside business hours'
);

-- Cancelled is terminal (AC-28) -----------------------------------------------
select throws_ok(
  $$ update public.consultations set status = 'scheduled' where id = '66666666-6666-6666-6666-666666666666' $$,
  '23514', null, 'AC-28: a cancelled consultation cannot be reopened'
);
select throws_ok(
  $$ update public.consultations set completed = true where id = '66666666-6666-6666-6666-666666666666' $$,
  '23514', null, 'AC-28: a cancelled consultation cannot be marked complete'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = tests.slot(8, 10) where id = '66666666-6666-6666-6666-666666666666' $$,
  '23514', null, 'AC-28: a cancelled consultation cannot be rescheduled'
);
select throws_ok(
  $$ update public.consultations set status = 'cancelled', completed = true where id = '55555555-5555-5555-5555-555555555555' $$,
  '23514', null, 'AC-28: a consultation cannot be cancelled and marked complete in one update'
);
select throws_ok(
  $$ update public.consultations set status = 'cancelled', scheduled_at = tests.slot(9, 10) where id = '55555555-5555-5555-5555-555555555555' $$,
  '23514', null, 'AC-28: a consultation cannot be cancelled and moved in one update'
);
select lives_ok(
  $$ update public.consultations set status = 'cancelled' where id = '55555555-5555-5555-5555-555555555555' $$,
  'AC-6: a scheduled consultation can be cancelled'
);
select throws_ok(
  $$ update public.consultations set status = 'scheduled' where id = '55555555-5555-5555-5555-555555555555' $$,
  '23514', null, 'AC-28: a consultation cancelled a moment ago cannot be reopened either'
);

-- The past is history (A17) ----------------------------------------------------
select throws_ok(
  $$ update public.consultations set status = 'cancelled' where id = '77777777-7777-7777-7777-777777777777' $$,
  '23514', 'a consultation that has started can no longer be moved or cancelled', 'a consultation that has started cannot be cancelled'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = tests.slot(8, 10) where id = '77777777-7777-7777-7777-777777777777' $$,
  '23514', 'a consultation that has started can no longer be moved or cancelled', 'a consultation that has started cannot be moved'
);
select lives_ok(
  $$ update public.consultations set completed = true where id = '77777777-7777-7777-7777-777777777777' $$,
  'the Completed tick can still be changed on a consultation that has happened'
);
select lives_ok(
  $$ update public.consultations set completed = false where id = '77777777-7777-7777-7777-777777777777' $$,
  'and changed back'
);

-- Completed means it happened: only once it has started ------------------------
select throws_ok(
  $$ update public.consultations set completed = true where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', 'a consultation can only be marked complete once it has started',
  'a consultation that is still to come cannot be marked complete'
);
select throws_ok(
  $$ update public.consultations set completed = true, scheduled_at = tests.slot(9, 10) where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', 'a consultation can only be marked complete once it has started',
  'nor can it be moved and marked complete in one update'
);
select lives_ok(
  $$ update public.consultations set completed = false where id = '44444444-4444-4444-4444-444444444444' $$,
  'leaving a future consultation not complete is fine'
);

-- The state a list sorts and filters by: the same four words the badge shows ---------------------
select is(
  (select state from public.consultation_details where id = '44444444-4444-4444-4444-444444444444'),
  'scheduled', 'a consultation still to come is scheduled'
);
select is(
  (select state from public.consultation_details where id = '66666666-6666-6666-6666-666666666666'),
  'cancelled', 'a cancelled one is cancelled'
);
select is(
  (select state from public.consultation_details where id = '77777777-7777-7777-7777-777777777777'),
  'awaiting', 'one that has started but is not ticked is awaiting (not marked complete)'
);
update public.consultations set completed = true where id = '77777777-7777-7777-7777-777777777777';
select is(
  (select state from public.consultation_details where id = '77777777-7777-7777-7777-777777777777'),
  'complete', 'and once ticked it is complete'
);
update public.consultations set completed = false where id = '77777777-7777-7777-7777-777777777777';

-- Timestamps are the database's -----------------------------------------------
select ok(
  (select updated_at > now() - interval '1 hour' from public.consultations where id = '77777777-7777-7777-7777-777777777777'),
  'updated_at moves on every update'
);

-- What a student cannot forge (column grants) ---------------------------------
select tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$ update public.consultations set tutor_id = 'aaaaaaaa-0000-0000-0000-000000000005' where id = '44444444-4444-4444-4444-444444444444' $$,
  '42501', null, 'a student cannot change the tutor of a booking (cancel and rebook instead)'
);
select throws_ok(
  $$ update public.consultations set reason = 'Mallory' where id = '44444444-4444-4444-4444-444444444444' $$,
  '42501', null, 'AC-17: the reason is fixed once booked'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'pre-cancelled', tests.slot(25, 10), 'cancelled') $$,
  '42501', null, 'a new booking cannot be inserted already cancelled'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at, completed)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'pre-completed', tests.slot(25, 10), true) $$,
  '42501', null, 'a new booking cannot be inserted already completed'
);
select throws_ok(
  $$ insert into public.consultations (student_id, tutor_id, reason, scheduled_at, created_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'forged created_at', tests.slot(25, 10), '2000-01-01') $$,
  '42501', null, 'created_at cannot be forged'
);
select throws_ok(
  $$ insert into public.consultations (id, student_id, tutor_id, reason, scheduled_at)
     values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'chosen id', tests.slot(25, 10)) $$,
  '42501', null, 'the id cannot be chosen'
);
select tests.clear_authentication();

select * from finish();
rollback;
