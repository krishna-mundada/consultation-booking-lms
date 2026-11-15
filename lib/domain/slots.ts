// Bookings are slots in one fixed zone, Australia/Melbourne, whatever zone the viewer is in
// (ADR 0007, A11-A14). The database holds the same rules (a weekday, a half-hour start from 9:00 to
// 16:30 Melbourne time, at least an hour ahead, at most 56 days ahead) as constraints and triggers, so
// these helpers only decide what to offer; they cannot widen what is allowed.

export const BOOKING_ZONE = "Australia/Melbourne";
/** The locale every time and date is worded in. */
export const LOCALE = "en-AU";
export const SLOT_MINUTES = 30;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 17;
const MIN_NOTICE_MINUTES = 60;
const MAX_DAYS_AHEAD = 56;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

const partsFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: BOOKING_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
});

/** The Melbourne wall-clock parts of an instant. */
export function zoneParts(ms: number): Parts {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

/** The UTC instant (ISO) for a wall-clock time in Melbourne. Settles in two passes across a clock change. */
export function melbourneInstant(year: number, month: number, day: number, hour: number, minute: number): string {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall;
  for (let pass = 0; pass < 2; pass++) {
    const p = zoneParts(utc);
    utc -= Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wall;
  }
  return new Date(utc).toISOString();
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (p: Pick<Parts, "year" | "month" | "day">) => `${p.year}-${pad(p.month)}-${pad(p.day)}`;

function parseDay(date: string): [number, number, number] {
  const match = DAY.exec(date);
  if (!match) throw new RangeError(`Invalid date: "${date}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Invalid date: "${date}"`);
  }
  return [year, month, day];
}

/** The slot instants (ISO, UTC) for a Melbourne calendar day given as YYYY-MM-DD. */
export function slotsForDay(date: string): string[] {
  const [year, month, day] = parseDay(date);
  const slots: string[] = [];
  for (let minutes = DAY_START_HOUR * 60; minutes < DAY_END_HOUR * 60; minutes += SLOT_MINUTES) {
    slots.push(melbourneInstant(year, month, day, Math.floor(minutes / 60), minutes % 60));
  }
  return slots;
}

/** The Melbourne calendar day (YYYY-MM-DD) an instant falls on. */
export function melbourneDate(iso: string): string {
  return isoDay(zoneParts(Date.parse(iso)));
}

/** "AEDT" in summer, "AEST" in winter: the zone label to show beside every time. */
export function zoneAbbreviation(iso: string): string {
  const name = new Intl.DateTimeFormat(LOCALE, { timeZone: BOOKING_ZONE, timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((part) => part.type === "timeZoneName")?.value;
  return name ?? "AEST";
}

/** A slot's time for a button, such as "9:00 am", in Melbourne time. */
export function formatSlotTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: BOOKING_ZONE }).format(
    new Date(iso),
  );
}

// Fixed, not from Intl: the locale data spells some months out ("July") and abbreviates others ("Nov").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "Nov" for month 11. */
export const monthAbbreviation = (month: number): string => MONTHS[month - 1];

/** "Fri" from a weekday name the Intl formatter produced ("Fri", "Friday"). */
export const weekdayAbbreviation = (weekday: string): string => weekday.slice(0, 3);

/** A Melbourne calendar day for a picker, such as "Fri 27 Nov". */
export function formatDayLabel(date: string): string {
  const [year, month, day] = parseDay(date);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

/** True for an instant exactly on a slot boundary (the half hour, no seconds): the database's CHECK. */
export function isOnSlotGrid(iso: string): boolean {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return false;
  return time.getUTCMinutes() % SLOT_MINUTES === 0 && time.getUTCSeconds() === 0 && time.getUTCMilliseconds() === 0;
}

/** Inside the booking window: at least an hour from now, at most 56 days. The server decides for real. */
export function isSlotBookable(iso: string, now: Date): boolean {
  const ahead = Date.parse(iso) - now.getTime();
  return ahead >= MIN_NOTICE_MINUTES * MINUTE_MS && ahead <= MAX_DAYS_AHEAD * DAY_MS;
}

/** The Melbourne weekdays that still have a bookable slot, today first. */
export function bookableDays(now: Date): string[] {
  const days: string[] = [];
  for (let offset = 0; offset <= MAX_DAYS_AHEAD + 1; offset++) {
    const parts = zoneParts(now.getTime() + offset * DAY_MS);
    if (parts.weekday === "Sat" || parts.weekday === "Sun") continue;
    const day = isoDay(parts);
    if (slotsForDay(day).some((slot) => isSlotBookable(slot, now))) days.push(day);
  }
  return days;
}
