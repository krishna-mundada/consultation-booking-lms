import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseListQuery, type ListSpec } from "@/lib/api/list-query";
import { loadSupabaseEnv } from "./env";

// Test-only helpers. The secret (service-role) key is used here to create fixture users and
// nowhere in application code (ADR 0002, 0003). Every test creates its own users with unique
// ids, so tests are independent and need no database reset (ADR 0004).

export type Db = SupabaseClient<Database>;

function required(name: string): string {
  loadSupabaseEnv(); // no-op when already set (CI, or Vitest's global setup)
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (is the local Supabase stack running?)`);
  return value;
}

const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function adminClient(): Db {
  return createClient<Database>(required("SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), options);
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  /** A client signed in as this user, subject to RLS exactly like the real app. */
  db: Db;
};

export type TestRole = "student" | "tutor" | "admin";

export async function createTestUser(role: TestRole = "student"): Promise<TestUser> {
  const admin = adminClient();
  const email = `${role}-${randomUUID()}@test.local`;
  const password = `pw-${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  if (role !== "student") {
    const { error: promoteError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
    if (promoteError) throw new Error(`promote failed: ${promoteError.message}`);
  }

  const db = createClient<Database>(required("SUPABASE_URL"), required("SUPABASE_PUBLISHABLE_KEY"), options);
  const { error: signInError } = await db.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

  return { id: data.user.id, email, password, db };
}


// ---- Slots ------------------------------------------------------------------------------------
// The booking rules (ADR 0007, A11-A14): a weekday, a half-hour start from 9:00 to 16:30 Melbourne
// time, at least an hour ahead and at most 56 days ahead. These helpers work them out from first
// principles with Intl, not from application code, so the tests are an independent check.

const ZONE = "Australia/Melbourne";
const DAY_MS = 86_400_000;
/** Starts per day: 9:00, 9:30 ... 16:30. */
export const SLOTS_PER_DAY = 16;

export const zoneParts = (ms: number) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, weekday: parts.weekday };
};

/** The UTC instant for a wall-clock time in Melbourne (settles in two passes across a DST change). */
export function melbourneInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall;
  for (let i = 0; i < 2; i++) {
    const p = zoneParts(utc);
    utc = utc - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wall);
  }
  return new Date(utc);
}

/** The `index`th weekday on or after `daysAhead` days from now, in Melbourne. */
function nthWeekday(daysAhead: number, index: number) {
  let found = -1;
  for (let d = daysAhead; d < daysAhead + 400; d++) {
    const p = zoneParts(Date.now() + d * DAY_MS);
    if (p.weekday !== "Sat" && p.weekday !== "Sun" && ++found === index) return p;
  }
  throw new Error("no weekday found");
}

/** A valid slot: the `slot`th start (0-15) on the `weekday`th weekday from `daysAhead` days out. */
export function businessSlot(weekday = 0, slot = 0, daysAhead = 2): string {
  const day = nthWeekday(daysAhead, weekday);
  const minutes = 9 * 60 + (slot % SLOTS_PER_DAY) * 30;
  return melbourneInstant(day.year, day.month, day.day, Math.floor(minutes / 60), minutes % 60).toISOString();
}

/** A client signed in as an existing user (for example one who signed up through the UI), subject to RLS. */
export async function signedInAs(email: string, password: string): Promise<{ id: string; db: Db }> {
  const db = createClient<Database>(required("SUPABASE_URL"), required("SUPABASE_PUBLISHABLE_KEY"), options);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`signIn failed: ${error?.message}`);
  return { id: data.user.id, db };
}

/**
 * A slot as the app words it, worked out here with Intl (not from app code): the Melbourne day as
 * YYYY-MM-DD (a day picker's value), the time as "10:30 am", and the full text a card shows.
 */
export function slotParts(slot: string) {
  const ms = Date.parse(slot);
  const p = zoneParts(ms);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const label = `${hour12}:${pad(p.minute)} ${p.hour < 12 ? "am" : "pm"}`;
  const zone = new Intl.DateTimeFormat("en-AU", { timeZone: ZONE, timeZoneName: "short" })
    .formatToParts(new Date(ms))
    .find((part) => part.type === "timeZoneName")!.value;
  return {
    day: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    /** The day as the day dropdown words it, such as "Tue 1 Dec". */
    dayLabel: `${p.weekday} ${p.day} ${MONTHS[p.month - 1]}`,
    label,
    shown: `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${label} ${zone}`,
  };
}

let slotCounter = 0;
/**
 * A valid slot no other call in this process has returned (about 560 of them, over the next ~7
 * weeks), so a test can book one student or one tutor repeatedly without two bookings colliding.
 * Each test creates its own users, so uniqueness per process is enough.
 */
export function uniqueSlot(): string {
  const n = slotCounter++;
  if (n >= 35 * SLOTS_PER_DAY) throw new Error("uniqueSlot: out of slots for this run");
  return businessSlot(Math.floor(n / SLOTS_PER_DAY), n % SLOTS_PER_DAY, 2);
}

/** A tutor: someone a consultation can be booked with. */
export const createTutor = () => createTestUser("tutor");

/** Parses a query string against a list spec, as the route handlers do. */
export const listQuery = (spec: ListSpec, query = "") => parseListQuery(spec, new URLSearchParams(query));
