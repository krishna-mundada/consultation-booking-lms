import type { PostgrestError } from "@supabase/supabase-js";
import {
  assertChangeable,
  type Change,
  systemClock,
  toApiConsultation,
  type Clock,
} from "@/lib/domain/consultation-rules";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import {
  applyListQuery,
  desc,
  pageOf,
  pageRange,
  type FilterDef,
  type ListSpec,
  type ParsedList,
} from "@/lib/api/list-query";
import type { Page } from "@/lib/schemas/api";
import {
  CONSULTATION_FILTER,
  CONSULTATION_SORT,
  CONSULTATION_STATE,
  CONSULTATION_STATUS,
  WHEN,
  type ApiConsultation,
  type CreateConsultationInput,
} from "@/lib/schemas/consultation";
import { fail, type Access, type Db } from "./access";

// Business logic for consultations. It knows nothing about HTTP or cookies: it receives a Supabase
// client already scoped to the signed-in user, so every query runs as that user and RLS stays in
// force. The rules are checked here for friendly errors as well, and the database is the final
// authority (ADR 0001, 0006, 0007).

/** The view that carries both names, read with the caller's rights so every policy applies. */
const VIEW = "consultation_details";

/** PostgREST's code for "the requested page is past the last row". */
const PGRST_RANGE_NOT_SATISFIABLE = "PGRST103";

// Postgres error codes the write paths turn into a clear answer.
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

const STATE_VALUES = Object.values(CONSULTATION_STATE);

// What a consultation list can be filtered by, shared by the three views of it. `when` is the
// time-based "upcoming or past" filter; the rest are plain comparisons.
const SORT = CONSULTATION_SORT;
const FILTER = CONSULTATION_FILTER;

const FILTERS = {
  // Named "status" (the column heading) but works on the state the badge shows, not the stored status.
  [FILTER.status]: { column: "state", kind: { kind: "enum", values: STATE_VALUES }, ops: ["eq", "in"] },
  [FILTER.when]: {
    column: "scheduled_at",
    kind: { kind: "enum", values: Object.values(WHEN) },
    ops: ["eq"],
    apply: (query, value, now) =>
      value === WHEN.upcoming ? query.gte("scheduled_at", now.toISOString()) : query.lt("scheduled_at", now.toISOString()),
  },
  [FILTER.scheduledAt]: { column: "scheduled_at", kind: { kind: "instant" }, ops: ["gte", "lte"] },
} satisfies Record<string, FilterDef>;

const byUuid = (column: string): FilterDef => ({ column, kind: { kind: "uuid" }, ops: ["eq", "in"] });

/** A student's own consultations. Soonest first. */
export const STUDENT_LIST = {
  sorts: { [SORT.scheduledAt]: "scheduled_at", [SORT.tutorName]: "tutor_name", [SORT.status]: "state", [SORT.createdAt]: "created_at" },
  defaultSort: SORT.scheduledAt,
  filters: { ...FILTERS, [FILTER.tutorId]: byUuid("tutor_id") },
  search: ["tutor_name", "reason"],
} satisfies ListSpec;

/** The consultations booked with a tutor ("My sessions"). Soonest first. */
export const TUTOR_SESSIONS_LIST = {
  sorts: { [SORT.scheduledAt]: "scheduled_at", [SORT.studentName]: "student_name", [SORT.status]: "state", [SORT.createdAt]: "created_at" },
  defaultSort: SORT.scheduledAt,
  filters: { ...FILTERS, [FILTER.studentId]: byUuid("student_id") },
  search: ["student_name", "reason"],
} satisfies ListSpec;

/** Every consultation, for an admin. Newest first. */
export const ADMIN_LIST = {
  sorts: {
    [SORT.scheduledAt]: "scheduled_at",
    [SORT.tutorName]: "tutor_name",
    [SORT.studentName]: "student_name",
    [SORT.status]: "state",
    [SORT.createdAt]: "created_at",
  },
  defaultSort: desc(SORT.scheduledAt),
  filters: { ...FILTERS, [FILTER.tutorId]: byUuid("tutor_id"), [FILTER.studentId]: byUuid("student_id") },
  search: ["tutor_name", "student_name", "reason"],
} satisfies ListSpec;

/**
 * What a failed write means to the caller. The unique indexes are the final word on a double
 * booking (two students can race for the same slot), so their violation is "that slot was just
 * taken" or "you already have something then"; the rule triggers (ADR 0007) explain themselves.
 */
function writeError(context: string, error: PostgrestError): never {
  const message = error.message;
  if (error.code === UNIQUE_VIOLATION) {
    throw new ConflictError(message.includes("consultations_student_slot_key") ? MESSAGES.studentBusy : MESSAGES.slotTaken);
  }
  if (error.code === FOREIGN_KEY_VIOLATION) {
    throw new ValidationError(MESSAGES.invalidRequest, { tutor_id: [MESSAGES.chooseTutor] });
  }
  if (error.code === CHECK_VIOLATION) {
    // Before "started": this message contains that word too.
    if (message.includes("marked complete")) throw new ConflictError(MESSAGES.notStartedYet);
    if (message.includes("tutor")) throw new ValidationError(MESSAGES.invalidRequest, { tutor_id: [MESSAGES.chooseTutor] });
    if (message.includes("cancelled")) throw new ConflictError(MESSAGES.cancelledIsFinal);
    if (message.includes("started")) throw new ConflictError(MESSAGES.alreadyStarted);
    // A CHECK on the column (the slot grid) names the constraint; the rule triggers speak plainly.
    const text = message.includes("violates check constraint") ? MESSAGES.notOnSlot : message;
    throw new ValidationError(MESSAGES.invalidRequest, { scheduled_at: [text] });
  }
  return fail(context, error);
}

export function createConsultationsService(db: Db, access: Access, clock: Clock = systemClock) {
  const userId = access.userId;

  async function list(
    spec: ListSpec,
    scope: { column: string; value: string } | null,
    parsed: ParsedList,
    count: "exact" | "estimated",
  ): Promise<Page<ApiConsultation>> {
    const now = clock();
    const build = (head: boolean) => {
      let query = db.from(VIEW).select("*", { count, head });
      if (scope) query = query.eq(scope.column, scope.value);
      return applyListQuery(query, parsed, spec, "id", now);
    };

    const { from, to } = pageRange(parsed);
    const [result, viewer] = await Promise.all([build(false).range(from, to), access.viewer()]);

    // A page past the last row is not an error for the caller: PostgREST answers "range not
    // satisfiable", so return an empty page and look up the real total separately.
    if (result.error?.code === PGRST_RANGE_NOT_SATISFIABLE) {
      const { count: total, error } = await build(true);
      if (error) fail("count", error);
      return pageOf([], parsed, total ?? 0);
    }
    if (result.error) fail("list", result.error);

    return pageOf(
      (result.data ?? []).map((row) => toApiConsultation(row, viewer, now)),
      parsed,
      result.count ?? 0,
    );
  }

  /** One consultation as the caller sees it (for the answer to a write). */
  async function details(id: string): Promise<ApiConsultation> {
    const { data, error } = await db.from(VIEW).select("*").eq("id", id).single();
    if (error) fail("read back", error);
    return toApiConsultation(data, await access.viewer(), clock());
  }

  /**
   * Applies a change to one of the caller's own consultations. The ownership and state filters live
   * in the UPDATE itself, so there is no read-then-write race. If nothing matched we look again to
   * tell "cancelled" or "already started" (conflict) from "missing or not yours" (404).
   */
  async function mutate(
    id: string,
    patch: { scheduled_at?: string; completed?: boolean; status?: string },
    change: Change,
  ): Promise<ApiConsultation> {
    await access.assertCan("write");
    const now = clock();

    let update = db.from("consultations").update(patch).eq("id", id).eq("student_id", userId);
    if (change === "move_or_cancel") {
      update = update.eq("status", CONSULTATION_STATUS.scheduled).gt("scheduled_at", now.toISOString());
    } else {
      update = update.neq("status", CONSULTATION_STATUS.cancelled);
      // Marking complete needs it to have started; unticking does not.
      if (change === "complete") update = update.lte("scheduled_at", now.toISOString());
    }
    const { data, error } = await update.select("id").maybeSingle();
    if (error) writeError("update", error);
    if (data) return details(id);

    const { data: existing, error: lookupError } = await db
      .from("consultations")
      .select("status, scheduled_at")
      .eq("id", id)
      .eq("student_id", userId)
      .maybeSingle();
    if (lookupError) fail("lookup", lookupError);
    if (existing) assertChangeable({ status: existing.status as ApiConsultation["status"], scheduled_at: existing.scheduled_at }, now, change);
    throw new NotFoundError("Consultation not found");
  }

  return {
    /** The caller's own consultations. */
    listOwn: (parsed: ParsedList) => list(STUDENT_LIST, { column: "student_id", value: userId }, parsed, "exact"),

    /** Everything booked with the caller as the tutor: also for someone who has since stopped being one. */
    listAsTutor: (parsed: ParsedList) => list(TUTOR_SESSIONS_LIST, { column: "tutor_id", value: userId }, parsed, "exact"),

    /** Every consultation, for an admin. The permission check and the list run together; a refusal discards the list unread. */
    async listAll(parsed: ParsedList) {
      const [, result] = await Promise.all([access.assertCan("readAll"), list(ADMIN_LIST, null, parsed, "estimated")]);
      return result;
    },

    async create(input: CreateConsultationInput): Promise<ApiConsultation> {
      await access.assertCan("write");
      // student_id always comes from the session, never from the request.
      const { data, error } = await db
        .from("consultations")
        .insert({ tutor_id: input.tutor_id, reason: input.reason, scheduled_at: input.scheduled_at, student_id: userId })
        .select("id")
        .single();
      if (error) writeError("create", error);
      return details(data.id);
    },

    reschedule: (id: string, scheduledAt: string) => mutate(id, { scheduled_at: scheduledAt }, "move_or_cancel"),
    setCompleted: (id: string, completed: boolean) =>
      mutate(id, { completed }, completed ? "complete" : "uncomplete"),
    cancel: (id: string) => mutate(id, { status: CONSULTATION_STATUS.cancelled }, "move_or_cancel"),
  };
}

