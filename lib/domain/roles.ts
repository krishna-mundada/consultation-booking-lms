import { z } from "zod";

// The role model, defined once (ADR 0007). The database stores the role as text with a CHECK
// constraint (supabase/migrations); this is the typed view of it for the application, and
// CAPABILITIES is the only place that says what each role may do. The database policies and
// functions express the same rules (private.can_write(), private.is_admin(), admin_set_tutor);
// ADR 0001 and 0007 explain why both exist.

export const roleSchema = z.enum(["student", "tutor", "admin"]);
export type Role = z.infer<typeof roleSchema>;
/** `ROLE.admin` etc.: use instead of repeating the string literals. */
export const ROLE = roleSchema.enum;

/**
 * - `write`: book, reschedule, complete and cancel one's own consultations.
 * - `readAll`: list every consultation in the system, read-only.
 * - `manageTutors`: list people, and promote or demote tutors.
 *
 * Seeing the consultations booked with you (as a tutor) is not a capability: it follows from being
 * the tutor on them, and holds for a former tutor too.
 */
export type Capability = "write" | "readAll" | "manageTutors";

// A Record keyed by Role, so adding a role is a compile error until its capabilities are decided.
export const CAPABILITIES = {
  [ROLE.student]: { write: true, readAll: false, manageTutors: false },
  [ROLE.tutor]: { write: false, readAll: false, manageTutors: false },
  [ROLE.admin]: { write: false, readAll: true, manageTutors: true },
} as const satisfies Record<Role, Record<Capability, boolean>>;

/** A missing or unknown role has no capabilities: access is granted by the table, never by default. */
export const can = (role: Role | null | undefined, capability: Capability): boolean =>
  role ? CAPABILITIES[role][capability] : false;

export const isAdmin = (role: Role | null | undefined): boolean => role === ROLE.admin;
export const isTutor = (role: Role | null | undefined): boolean => role === ROLE.tutor;

/** Narrows a stored value to a Role, or null when it is not one the application knows. */
export function parseRole(value: unknown): Role | null {
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
