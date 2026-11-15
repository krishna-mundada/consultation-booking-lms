import { handle, json } from "@/lib/api/handler";
import { parseListQuery } from "@/lib/api/list-query";
import { ADMIN_LIST } from "@/lib/services/consultations";

// GET /api/admin/consultations: every consultation, read-only (AC-7, AC-10, AC-12). The service
// refuses non-admins (403); RLS independently limits everyone else to their own rows.
export const GET = handle(async ({ request, services }) => {
  const query = parseListQuery(ADMIN_LIST, new URL(request.url).searchParams);
  return json(await services.consultations.listAll(query));
});
