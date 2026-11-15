import { pageOf, pageRange, type ListSpec, type ParsedList } from "@/lib/api/list-query";
import { ROLE } from "@/lib/domain/roles";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import type { Page } from "@/lib/schemas/api";
import {
  PEOPLE_FILTER,
  PEOPLE_SORT,
  personSchema,
  setTutorResultSchema,
  type Person,
  type SetTutorInput,
  type SetTutorResult,
} from "@/lib/schemas/people";
import { fail, type Access, type Db } from "./access";

// The admin's tools for managing tutors (ADR 0007, A4, A8, A21). Emails live in auth.users, which
// the API cannot read, so both operations go through database functions that run with their owner's
// rights and refuse everyone but an admin. This layer checks the capability first for a friendlier
// 403, and turns the functions' errors into the API's.

const ROLE_VALUES = Object.values(ROLE);

// Postgres codes the functions raise.
const INSUFFICIENT_PRIVILEGE = "42501";
const NO_DATA_FOUND = "P0002";
const CHECK_VIOLATION = "23514";
const CHOOSE_CANCEL_OR_KEEP = "choose_cancel_or_keep";

/** The People table. Name order; search is by name or email. */
export const PEOPLE_LIST = {
  sorts: {
    [PEOPLE_SORT.name]: "name",
    [PEOPLE_SORT.email]: "email",
    [PEOPLE_SORT.role]: "role",
    [PEOPLE_SORT.upcoming]: "upcoming",
  },
  defaultSort: PEOPLE_SORT.name,
  filters: { [PEOPLE_FILTER.role]: { column: "role", kind: { kind: "enum", values: ROLE_VALUES }, ops: ["eq", "in"] } },
  search: ["display_name", "email"],
} satisfies ListSpec;

export function createPeopleService(db: Db, access: Access) {
  async function fetchPage(parsed: ParsedList) {
    const sort = parsed.sort[0];
    const roles = parsed.filters.find((filter) => filter.name === PEOPLE_FILTER.role)?.value;
    const { from } = pageRange(parsed);
    return db.rpc("admin_list_people", {
      p_q: parsed.q ?? undefined,
      p_roles: roles === undefined ? undefined : Array.isArray(roles) ? roles : [roles],
      p_sort: sort.column,
      p_desc: sort.desc,
      p_limit: parsed.pageSize,
      p_offset: from,
    });
  }

  return {
    async list(parsed: ParsedList): Promise<Page<Person>> {
      await access.assertCan("manageTutors");
      const { data, error } = await fetchPage(parsed);
      if (error) fail("list people", error);

      let total = Number(data[0]?.total ?? 0);
      // The total travels on each row, so a page past the end has no row to read it from.
      if (data.length === 0 && parsed.page > 1) {
        const first = await fetchPage({ ...parsed, page: 1, pageSize: 1 });
        if (first.error) fail("list people", first.error);
        total = Number(first.data[0]?.total ?? 0);
      }

      // Pick the fields the API returns; `total` is a per-row detail of the function, not of a person.
      const people = data.map((row) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        display_name: row.display_name,
        email: row.email,
        role: row.role,
        upcoming: Number(row.upcoming),
      }));
      return pageOf(personSchema.array().parse(people), parsed, total);
    },

    /** Promotes a student to tutor, or demotes a tutor. Never touches an admin. */
    async setTutor(userId: string, input: SetTutorInput): Promise<SetTutorResult> {
      await access.assertCan("manageTutors");
      const { data, error } = await db.rpc("admin_set_tutor", {
        p_user: userId,
        p_make_tutor: input.tutor,
        p_cancel_upcoming: input.cancel_upcoming,
      });
      if (error) {
        if (error.code === INSUFFICIENT_PRIVILEGE) throw new ForbiddenError();
        if (error.code === NO_DATA_FOUND) throw new NotFoundError("Person not found");
        if (error.code === CHECK_VIOLATION && error.hint === CHOOSE_CANCEL_OR_KEEP) {
          throw new ConflictError(MESSAGES.tutorHasUpcoming);
        }
        fail("set tutor", error);
      }
      return setTutorResultSchema.parse(data);
    },
  };
}

