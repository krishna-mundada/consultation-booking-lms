import { ConflictError } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import { can, type Role } from "@/lib/domain/roles";
import { melbourneDate } from "@/lib/domain/slots";
import {
  CONSULTATION_STATE,
  CONSULTATION_STATUS,
  type ConsultationState,
  consultationRowSchema,
  type ApiConsultation,
  type ConsultationRow,
} from "@/lib/schemas/consultation";

// Pure business rules: no I/O, so they are cheap to test exhaustively. The database enforces the same
// rules (ADR 0006, 0007); these give the friendlier answers and the read-path flags.

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

type Timing = Pick<ConsultationRow, "status" | "scheduled_at">;

/** Once a consultation's start time has passed it is history (ADR 0007, A17). */
export const hasStarted = (row: Pick<ConsultationRow, "scheduled_at">, now: Date): boolean =>
  Date.parse(row.scheduled_at) <= now.getTime();

/** It can be moved or cancelled: scheduled, and not yet started. */
export const canChange = (row: Timing, now: Date): boolean =>
  row.status === CONSULTATION_STATUS.scheduled && !hasStarted(row, now);

/**
 * The Completed tick means "it happened", so it can be ticked only once the consultation has started, and
 * never on a cancelled one. Unticking one that is already ticked is always possible.
 */
export const canComplete = (row: Pick<ConsultationRow, "status" | "scheduled_at" | "completed">, now: Date): boolean =>
  row.status !== CONSULTATION_STATUS.cancelled && (row.completed || hasStarted(row, now));

/** What a change to a consultation is, for deciding whether it is allowed. */
export type Change = "move_or_cancel" | "complete" | "uncomplete";

/**
 * Why a change is refused, as a 409. AC-28: a cancelled consultation is terminal. A17: one that has
 * started can no longer be moved or cancelled. Marking one complete needs it to have started. Nothing is
 * thrown when the change is allowed.
 */
export function assertChangeable(row: Timing, now: Date, change: Change): void {
  if (row.status === CONSULTATION_STATUS.cancelled) throw new ConflictError(MESSAGES.cancelledIsFinal);
  if (change === "move_or_cancel" && hasStarted(row, now)) throw new ConflictError(MESSAGES.alreadyStarted);
  if (change === "complete" && !hasStarted(row, now)) throw new ConflictError(MESSAGES.notStartedYet);
}

/**
 * How a consultation looks, decided in one place so the cards and the tables agree:
 * - cancelled: it will not happen
 * - complete: it happened and was marked complete
 * - awaiting: its time has come (it has started) but it has not been marked complete
 * - today: still to come, later today (Melbourne time)
 * - upcoming: still to come, on a later day
 */
export type Tone = "cancelled" | "complete" | "awaiting" | "today" | "upcoming";

export function consultationTone(row: Pick<ConsultationRow, "status" | "scheduled_at" | "completed">, now: Date): Tone {
  if (row.status === CONSULTATION_STATUS.cancelled) return "cancelled";
  if (row.completed) return "complete";
  if (hasStarted(row, now)) return "awaiting";
  return melbourneDate(row.scheduled_at) === melbourneDate(now.toISOString()) ? "today" : "upcoming";
}

/** The state a tone stands for: today and upcoming are both "scheduled". */
export const toneState = (tone: Tone): ConsultationState =>
  tone === "today" || tone === "upcoming" ? CONSULTATION_STATE.scheduled : CONSULTATION_STATE[tone];

export type Viewer = { id: string; role: Role | null };

/**
 * Shapes a row of the consultation_details view for the API. Fails loudly on a status the app does
 * not know. The two flags are the read-path twins of the write guards: only the student, who holds
 * the write capability, can change their own consultation, and only while the rules allow it.
 */
export function toApiConsultation(raw: unknown, viewer: Viewer, now: Date): ApiConsultation {
  const row = consultationRowSchema.parse(raw);
  const isTheStudent = can(viewer.role, "write") && row.student_id === viewer.id;
  return {
    ...row,
    can_edit: isTheStudent && canChange(row, now),
    can_complete: isTheStudent && canComplete(row, now),
  };
}
