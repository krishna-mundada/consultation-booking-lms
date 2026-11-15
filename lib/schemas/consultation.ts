import { z } from "zod";
import { isOnSlotGrid } from "@/lib/domain/slots";
import { MESSAGES } from "@/lib/messages";

// The same schemas validate in the browser (forms) and on the server (route handlers),
// so there is one definition of "valid" (ADR 0005). The numbers below are the single source
// for the app; the database repeats the limits as CHECK constraints on purpose
// (defence in depth: ADR 0006) and pgTAP covers that copy.

export const REASON_MAX = 1000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/**
 * Keeps an absurd page number from reaching PostgREST (which would answer 416, a 500 for us), and
 * bounds how deep an offset scan can go: at most 100,000 rows. Beyond that a keyset cursor is
 * the right tool (see "What I would do next" in the README).
 */
export const MAX_PAGE = 1_000;

const consultationStatusSchema = z.enum(["scheduled", "cancelled"]);
/** `CONSULTATION_STATUS.cancelled` etc.: use instead of repeating the string literals. */
/**
 * The state a list sorts and filters by, the same four words as the badge (the database works it out: see the
 * consultation_details view). `status` is the stored column; this is what a person sees.
 */
export const CONSULTATION_STATE = {
  scheduled: "scheduled",
  /** Its time has come but it is not marked complete. */
  awaiting: "awaiting",
  complete: "complete",
  cancelled: "cancelled",
} as const;

export type ConsultationState = (typeof CONSULTATION_STATE)[keyof typeof CONSULTATION_STATE];

/**
 * The names a consultation list is sorted and filtered by: the API's vocabulary, shared by the server specs
 * (lib/services/consultations.ts) and the screens, so a rename is a compile error and not a silent mismatch.
 */
export const CONSULTATION_SORT = {
  scheduledAt: "scheduled_at",
  tutorName: "tutor_name",
  studentName: "student_name",
  status: "status",
  createdAt: "created_at",
} as const;

/** `status` filters by the state (CONSULTATION_STATE); `when` is upcoming or past. */
export const CONSULTATION_FILTER = {
  status: "status",
  when: "when",
  tutorId: "tutor_id",
  studentId: "student_id",
  scheduledAt: "scheduled_at",
} as const;

export const WHEN = { upcoming: "upcoming", past: "past" } as const;

/** What a PATCH to a consultation can do. */
export const CONSULTATION_ACTION = {
  reschedule: "reschedule",
  setCompleted: "set_completed",
  cancel: "cancel",
} as const;

/** The tutor picker sorts by name. */
export const TUTOR_SORT = { displayName: "display_name" } as const;

export const CONSULTATION_STATUS = consultationStatusSchema.enum;

// ISO-8601 with an explicit offset or Z: the server never guesses a timezone (conventions C1).
const instantSchema = z.iso.datetime({ offset: true });

// A booking time is a slot: the half hour, nothing finer (lib/domain/slots.ts, and a CHECK in the database).
const slotInstantSchema = instantSchema.refine(isOnSlotGrid, MESSAGES.notOnSlot);

// Postgres cannot store a NUL character in text; reject it here so it is a 400, not a 500.
const noNul = (value: string) => !value.includes("\u0000");

/** Optional free text (ADR 0007, A16). Nothing, or only spaces, means "no reason given". */
const reasonSchema = z
  .string()
  .trim()
  .max(REASON_MAX, `Too long (max ${REASON_MAX})`)
  .refine(noNul, "Contains an invalid character")
  .nullish()
  .transform((value) => (value ? value : null));

export const createConsultationSchema = z.object({
  tutor_id: z.guid(MESSAGES.chooseTutor),
  reason: reasonSchema,
  scheduled_at: slotInstantSchema,
});

// One PATCH endpoint discriminated by `action`; each action maps to a fixed set of columns,
// so a request cannot touch anything it should not (student_id, status via reschedule...).
export const updateConsultationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal(CONSULTATION_ACTION.reschedule), scheduled_at: slotInstantSchema }),
  z.object({ action: z.literal(CONSULTATION_ACTION.setCompleted), completed: z.boolean() }),
  z.object({ action: z.literal(CONSULTATION_ACTION.cancel) }),
]);

// guid, not uuid: Zod's uuid() insists on a version digit, which Postgres does not, so it would refuse ids the database made.
export const idSchema = z.guid();

/** A row of the `consultation_details` view: nullable in the generated types, never null in practice. */
export const consultationRowSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  tutor_id: z.string(),
  student_name: z.string().nullable().transform((value) => value ?? ""),
  tutor_name: z.string().nullable().transform((value) => value ?? ""),
  reason: z.string().nullable(),
  scheduled_at: z.string(),
  status: consultationStatusSchema,
  completed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ConsultationRow = z.infer<typeof consultationRowSchema>;

/**
 * A consultation as the API returns it. The TypeScript type `ApiConsultation` is derived from
 * this schema, and the browser client validates responses against it, so the shape is defined
 * once instead of as a hand-kept copy of the database row.
 */
export const apiConsultationSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  student_name: z.string(),
  tutor_id: z.string(),
  tutor_name: z.string(),
  reason: z.string().nullable(),
  scheduled_at: z.string(),
  status: consultationStatusSchema,
  completed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  /** True only when the viewer is the student, and it is scheduled and has not started: it can be moved or cancelled. */
  can_edit: z.boolean(),
  /** True when the viewer is the student and it is not cancelled: the Completed tick can be changed. */
  can_complete: z.boolean(),
});

export type ApiConsultation = z.infer<typeof apiConsultationSchema>;

/** Someone a consultation can be booked with: a profile with the tutor role. */
export const tutorSchema = z.object({ id: z.string(), display_name: z.string() });
export type Tutor = z.infer<typeof tutorSchema>;

/** `?from=&to=` for a tutor's busy times: a window of at most 35 days (the database enforces the cap). */
const BUSY_WINDOW_DAYS = 35;
export const busyQuerySchema = z
  .object({ from: instantSchema, to: instantSchema })
  .refine(
    ({ from, to }) => {
      const span = Date.parse(to) - Date.parse(from);
      return span > 0 && span <= BUSY_WINDOW_DAYS * 86_400_000;
    },
    { message: `The window must be after "from" and at most ${BUSY_WINDOW_DAYS} days`, path: ["to"] },
  );

export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;
export type UpdateConsultationInput = z.infer<typeof updateConsultationSchema>;
