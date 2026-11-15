import { handle, json } from "@/lib/api/handler";
import { parseListQuery } from "@/lib/api/list-query";
import { PEOPLE_LIST } from "@/lib/services/people";

// GET /api/admin/people: everyone, with their email, searchable by name or email (ADR 0007, A4).
// Admins only: the database function behind it refuses everyone else.
export const GET = handle(async ({ request, services }) => {
  const query = parseListQuery(PEOPLE_LIST, new URL(request.url).searchParams);
  return json(await services.people.list(query));
});
