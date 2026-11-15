import { applyListQuery, pageOf, pageRange, type ListSpec, type ParsedList } from "@/lib/api/list-query";
import { ROLE } from "@/lib/domain/roles";
import type { Page } from "@/lib/schemas/api";
import { TUTOR_SORT, tutorSchema, type Tutor } from "@/lib/schemas/consultation";
import { fail, type Db } from "./access";

// Who can be booked, and when each of them is already taken (ADR 0007).

/** The booking form's tutor picker: by name, searchable. */
export const TUTOR_PICKER_LIST = {
  sorts: { [TUTOR_SORT.displayName]: "display_name" },
  defaultSort: TUTOR_SORT.displayName,
  filters: {},
  search: ["display_name"],
  defaultPageSize: 20,
} satisfies ListSpec;

export function createTutorsService(db: Db) {
  return {
    async list(parsed: ParsedList): Promise<Page<Tutor>> {
      const query = applyListQuery(
        db
          .from("profiles")
          .select("id, display_name", { count: "exact" })
          .eq("role", ROLE.tutor),
        parsed,
        TUTOR_PICKER_LIST,
      );
      const { from, to } = pageRange(parsed);
      const { data, error, count } = await query.range(from, to);
      // A page past the end is an empty page, not an error.
      if (error?.code === "PGRST103") return pageOf([], parsed, 0);
      if (error) fail("list tutors", error);
      return pageOf(tutorSchema.array().parse(data ?? []), parsed, count ?? 0);
    },

    /** The instants a tutor is already booked in a window: nothing about who or why. */
    async busyTimes(tutorId: string, from: string, to: string): Promise<string[]> {
      const { data, error } = await db.rpc("tutor_busy_times", { p_tutor: tutorId, p_from: from, p_to: to });
      if (error) fail("busy times", error);
      return data ?? [];
    },
  };
}

