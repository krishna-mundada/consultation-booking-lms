# ADR 0005: Forms and dates

Status: accepted for authentication forms and the date rules; **the booking form and the date input are superseded by [ADR 0007](0007-roles-tutors-and-notifications.md)** (a tutor combobox and a slot picker in a fixed Melbourne zone, no free-typed time, no react-hook-form) · Covers: AC-4, AC-5, AC-17, AC-19, AC-20, AC-27

## Forms
Two kinds of form, chosen by what validates them.

- **Booking** uses react-hook-form with `zodResolver` over the same Zod schema the route handler uses
  (`createConsultationSchema`, minus the datetime, which the form edits as local time). The browser and
  the API therefore agree on what is valid and say it in the same words. The reschedule dialog is a
  single field, so it keeps one `useState` value and shows the server's message.
- **Authentication** forms (login, sign up, forgot and update password) are plain controlled forms.
  Credentials are judged by Supabase Auth, not by our schema, so a Zod resolver would only duplicate
  rules the service owns. Their failures go through one mapper (`authErrorMessage`) that turns Auth
  error codes into fixed text.

Every field, in both kinds, is a `FormField` (label, input, error tied together with `aria-describedby`),
and every submit button stays disabled until the page is interactive, so a native submit can never put
a value in the URL.

## Dates
- Store `timestamptz` (a UTC instant). The API accepts and returns ISO-8601 with an offset.
- The browser uses the native `datetime-local` input and converts local wall-clock time to a UTC
  instant before sending; display converts back to local time. No date library: native `Date` and
  `Intl.DateTimeFormat` are enough for one field, and extra code is extra surface.
- "In the future" is evaluated server-side. Client-side `min` is only a hint and is set after mount, so
  prerendering never bakes in a stale "now".
- Edge cases to test: DST changes (a local time that does not exist or occurs twice), midnight rollover,
  and a time one second in the past.
