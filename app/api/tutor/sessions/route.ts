import { handle, json } from "@/lib/api/handler";
import { parseListQuery } from "@/lib/api/list-query";
import { TUTOR_SESSIONS_LIST } from "@/lib/services/consultations";

// GET /api/tutor/sessions: the consultations booked with the caller as the tutor ("My sessions").
// Open to any signed-in user: the rows come from the tutor on each consultation, not from the role, so a
// former tutor still sees what they have yet to give and everyone else simply gets an empty list.
export const GET = handle(async ({ request, services }) => {
  const query = parseListQuery(TUTOR_SESSIONS_LIST, new URL(request.url).searchParams);
  return json(await services.consultations.listAsTutor(query));
});
