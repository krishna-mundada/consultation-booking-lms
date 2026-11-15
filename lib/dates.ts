// How the app words a time. Every time is shown in Australia/Melbourne with its zone label, whatever zone the
// viewer's browser is in (ADR 0007, A11): a booking is for a place and a time, and everyone involved should
// read the same one. The server and database only ever see UTC instants (docs/conventions.md C1).

import {
  BOOKING_ZONE,
  LOCALE,
  melbourneDate,
  monthAbbreviation,
  weekdayAbbreviation,
  zoneAbbreviation,
  zoneParts,
} from "@/lib/domain/slots";

function parseInstant(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant: "${iso}"`);
  return date;
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: BOOKING_ZONE });

/** "Fri 27 Nov 2026, 10:00 am AEDT": the full date and time of a consultation, in Melbourne time. */
export function formatConsultationTime(iso: string): string {
  const date = parseInstant(iso);
  const p = zoneParts(date.getTime());
  const day = `${weekdayAbbreviation(p.weekday)} ${p.day} ${monthAbbreviation(p.month)} ${p.year}`;
  return `${day}, ${timeFormat.format(date)} ${zoneAbbreviation(iso)}`;
}

const DAY_MS = 86_400_000;

/** The number of whole Melbourne calendar days between two Melbourne dates (YYYY-MM-DD). */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** How far ahead a consultation is described in words ("In 3 days"); beyond this the date speaks. */
const RELATIVE_DAYS_LIMIT = 14;

/**
 * "Today", "Tomorrow" or "In N days" for an upcoming consultation, counted in Melbourne calendar days.
 * Null for a past day or one more than two weeks out.
 */
export function relativeDay(iso: string, now: Date = new Date()): string | null {
  const days = daysBetween(melbourneDate(now.toISOString()), melbourneDate(parseInstant(iso).toISOString()));
  if (days < 0 || days > RELATIVE_DAYS_LIMIT) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** The weekday, day of month and month for a calendar tile, in Melbourne time. */
export function calendarParts(iso: string): { weekday: string; day: string; month: string } {
  const p = zoneParts(parseInstant(iso).getTime());
  return { weekday: weekdayAbbreviation(p.weekday), day: String(p.day), month: monthAbbreviation(p.month) };
}
