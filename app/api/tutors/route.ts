import { handle, json } from "@/lib/api/handler";
import { parseListQuery } from "@/lib/api/list-query";
import { TUTOR_PICKER_LIST } from "@/lib/services/tutors";

// GET /api/tutors: everyone a consultation can be booked with, by name, searchable with
// filter[q] (the booking form's picker). Any signed-in user can ask.
export const GET = handle(async ({ request, services }) => {
  const query = parseListQuery(TUTOR_PICKER_LIST, new URL(request.url).searchParams);
  return json(await services.tutors.list(query));
});
