# ADR 0007: Three roles, tutors, and in-app notifications

Status: agreed in review and built · Covers: AC-6, AC-12 (revises ADR 0001's two-role model)

## Roles
There are three, stored as `student`, `tutor` and `admin`. A person has exactly one.

| | Student | Tutor | Admin |
| --- | --- | --- | --- |
| How they get it | Self-register; every signup starts here | An admin promotes them | Seeded in code only |
| Book consultations | yes, with a tutor | no | no |
| Appear in the "book with" list | no | yes | no |
| See consultations | their own | all booked with them | all in the system, read-only |
| Promote or demote tutors | no | no | yes |

- The admin is the brief's read-only view across the whole system.
- No role can be raised from the browser. Admins are created only by the seed or SQL, never through
  the app, and an admin cannot be changed through the app.
- The database enforces the same rules as the app (grants, RLS, a role-checked function), so the
  browser cannot skip them.

## Demoting a tutor
- A tutor with no upcoming consultations is demoted immediately.
- With upcoming consultations the admin chooses:
  1. **Cancel them and notify the students.** The consultations become cancelled, their slots are
     freed, each student gets an in-app notification, and the tutor leaves the booking list.
  2. **Keep them.** The tutor only leaves the booking list; the consultations stay scheduled.
- Past and completed consultations are never touched, and a student's list keeps showing the former
  tutor's name on them.
- A former tutor keeps seeing the consultations already booked with them until they are done, in a
  "Sessions with me" section, so no booked student turns up to nobody. They cannot be booked again.

## Notifications
In-app only: a `notifications` table read by the student's dashboard (unread banner or bell, with
dismiss). Email is a later step; it would read from the same table.

## Signup and navigation
- Signup asks for first name, last name, email and password. The name is stored as the display name
  that tutors and students see. Everyone who signs up is a student.
- After login a student lands on their dashboard, a tutor on "my sessions" (the consultations booked
  with them), an admin on the all-consultations view. Each role sees only its own area.
- An admin manages tutors from a People screen: a table of every student and tutor, searchable by
  name or email, with a Tutor yes/no switch on each row. The admin can see people's emails there.
- Password reset and email confirmation are the same for every role.

## Booking
- The form is: tutor (a searchable picker), date, then a slot from that tutor's open slots, then an
  optional free-text reason. The brief's first and last name fields live at signup instead.
- Slots are 30 minutes, 9:00 to 17:00, Monday to Friday, the same for every tutor, in one fixed
  business time zone (Australia/Melbourne). Times are shown on each slot with the zone label and are
  not editable. A booking is at most 8 weeks ahead and at least 1 hour from now.
- A tutor has at most one scheduled consultation per slot, and a student cannot hold two scheduled
  consultations at the same time. The database decides races ("that time was just taken").
- Reschedule keeps the tutor; to change tutor, cancel and book again.

## To record in the README (assumptions and next steps)
- Assumptions: the slot hours and days, the fixed time zone, the 8-week horizon and 1-hour notice.
- What I would do next: tutors set their own availability; email notifications.

## Assumptions register
The brief asks for an admin with a read-only view of all consultations, and for the author to "define
roles" and "make assumptions on specific details". It says nothing about tutors, availability,
notifications or how admins are made. Everything below was decided in review, not taken from the
brief, and every item goes into the README's Assumptions section when it is built.

| # | Assumption | Status |
| --- | --- | --- |
| A1 | Three roles: student, tutor, admin. A person has one. | agreed |
| A2 | Students self-register; every signup is a student. | agreed |
| A3 | Admins are seeded in code only. There is no super admin: the admin role is the brief's read-only view. | agreed |
| A4 | An admin promotes and demotes tutors from a People screen: a table of all students and tutors, searchable by name or email, with a Tutor yes/no switch per row. Admins can see emails. | agreed (replaces "exact email only") |
| A5 | Admins are read-only on consultations. | agreed |
| A6 | A tutor sees all consultations booked with them, view only. | agreed (view only unless changed) |
| A7 | Signup asks first and last name, stored as the display name. The booking form has no name fields. | agreed |
| A8 | Demoting a tutor with upcoming consultations: the admin chooses to cancel and notify, or keep. | agreed |
| A9 | A former tutor keeps seeing sessions already booked with them ("Sessions with me"), and cannot be booked again. | agreed |
| A10 | Notifications are in-app only. Email is a later step. | agreed |
| A11 | Slots: 30 minutes, 9:00 to 17:00, Monday to Friday, identical for every tutor (no per-tutor calendars). | agreed |
| A12 | One fixed business time zone (Australia/Melbourne), shown on each slot and not editable. The label is AEDT or AEST, whichever is correct for that date. | agreed |
| A13 | Booking is at most 8 weeks ahead and at least 1 hour from now. | agreed |
| A14 | A tutor has one scheduled consultation per slot; a student cannot hold two at the same time; a cancellation frees the slot. | agreed |
| A15 | Reschedule keeps the tutor; to change tutor, cancel and rebook. | agreed |
| A16 | The reason is optional free text only: no presets. A consultation without one shows "No reason given". | agreed |
| A17 | Once a consultation's start time has passed it is history: it cannot be rescheduled or cancelled, and it shows that way on both the student's and the tutor's side. Only the student's Completed tick stays editable, and it can be ticked only once the consultation has started: Completed means it happened, so a future consultation cannot be marked complete (the database refuses it too). Unticking is always possible. | agreed, amended in review |
| A18 | A notification shows until dismissed and never expires. A cancellation reads: "Your consultation with {tutor} on {date and time, with zone} was cancelled because the tutor is no longer available." It never repeats the reason, which can be long. | agreed |
| A19 | Tutors are not notified when a student books, reschedules or cancels; they see it in their list. Tutor notifications are a later step. | agreed (read from "yes"; correct me if not) |
| A20 | A student sees a tutor's display name and nothing else: no email, no other consultations. | agreed (read from "yes"; correct me if not) |
| A21 | The People screen shows an "Upcoming" count per tutor and has filter chips (all, students, tutors, admins). The Tutor yes/no control is a switch. | agreed; the Tutor control is a switch (confirmed) |
| A22 | Every table of records is a data table: server-side search, sorting, filters where they make sense, and paging, so it stays usable with hundreds or thousands of rows. Search, sort, filters and page live in the URL. | agreed |
| A23 | Every list endpoint shares one convention, modelled on JSON:API and GraphQL connections: `page[number]` and `page[size]` with a `meta.page` block (number, size, total, total pages), `sort=-field,field`, `filter[field]` with `eq`, `in`, `gte`, `lte` per field, and `filter[q]` for free-text search. An unknown field is a 400 that lists the allowed ones. Each endpoint declares its allowed fields once and a shared parser and query builder do the rest. | agreed; page numbers now, cursors can be added later without changing clients |
| A24 | A student's own consultations stay as grouped cards (Upcoming, Earlier), but with sorting and filters (status, tutor, upcoming or past, date range) and a search, using the same API convention as the tables. The groups go by time alone: Upcoming is what has not started yet, Earlier is what has, whatever its status. Completed or cancelled changes how a card looks, not where it sits. | agreed, amended in review |
| A25 | No CSV export for now; it goes under "what I would do next". | agreed |
| A26 | The first admin on a hosted project is created by one documented line of SQL in the README (promote a signed-up user). There is no bootstrap script and no service-role key in the app. Locally the seed creates one. | agreed |
| A27 | The local seed has 1 admin, 2 tutors, 3 students, a few consultations (upcoming, past, cancelled) and one unread notification. | agreed |
| A28 | The work is built on the tutor-booking branch in the order database, API, screens, with tests at each step, and merged into rebuild only when the whole suite is green. | agreed |
| A29 | How a consultation looks follows one rule (today, upcoming, completed, started but not marked complete, cancelled): the date tile and the text colour come from it, so no two screens disagree. A reason longer than 140 characters (100 in tables) is shown folded with Read more. | agreed in review |
| A31 | The Status column, its sort and its filter use the same four words as the badge: scheduled, not marked complete, complete, cancelled. The database works the state out (the `state` column of `consultation_details`), so a completed consultation never sorts among the scheduled ones. | agreed in review |
| A30 | Public holidays are not modelled: every weekday from 9:00 to 17:00 Melbourne time can be booked, including days a school would be closed. A holiday calendar (or tutors setting their own availability) would close them. | assumption, in the README |

## Pending decisions
None. Built on the tutor-booking branch.

## Why
The brief asks for an admin view of all consultations and says "we want to see how you define roles".
A booking needs two parties, so the person being booked has to be a role of their own, and managing
who that is belongs to the admin. Keeping the tutor visible only through role-checked reads means a
student can never learn anything about another student.
