import { z } from "zod";
import { roleSchema } from "@/lib/domain/roles";

// What the admin's People screen works with (ADR 0007, A4, A21).

/** The longest first or last name the database keeps (it truncates beyond this when a profile is created). */
export const NAME_MAX = 100;

/** What sign-up asks for besides email and password (ADR 0007, A3): a name, which is how people are shown. */
export const signUpNamesSchema = z.object({
  first_name: z.string().trim().min(1, "Required").max(NAME_MAX, `At most ${NAME_MAX} characters`),
  last_name: z.string().trim().min(1, "Required").max(NAME_MAX, `At most ${NAME_MAX} characters`),
});

/** What the People list is sorted and filtered by (shared by the server spec and the screen). */
export const PEOPLE_SORT = { name: "name", email: "email", role: "role", upcoming: "upcoming" } as const;
export const PEOPLE_FILTER = { role: "role" } as const;

/** A row of the People list: everyone, with their email (admins only ever see this). */
export const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  display_name: z.string(),
  email: z.string(),
  role: roleSchema,
  /** For a tutor: upcoming scheduled consultations booked with them. 0 for everyone else. */
  upcoming: z.number(),
});
export type Person = z.infer<typeof personSchema>;

/**
 * Promote or demote a tutor. Turning a tutor off while they have upcoming consultations needs
 * `cancel_upcoming`: true cancels them and notifies the students, false keeps them.
 */
export const setTutorSchema = z.object({
  tutor: z.boolean(),
  cancel_upcoming: z.boolean().optional(),
});
export type SetTutorInput = z.infer<typeof setTutorSchema>;

/** What changed, reported back to the admin. */
export const setTutorResultSchema = z.object({
  role: roleSchema,
  upcoming: z.number(),
  cancelled: z.number(),
});
export type SetTutorResult = z.infer<typeof setTutorResultSchema>;
