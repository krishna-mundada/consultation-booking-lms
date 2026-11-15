import { handleWithParams, json, parse } from "@/lib/api/handler";
import { busyQuerySchema, idSchema } from "@/lib/schemas/consultation";

// GET /api/tutors/:id/busy?from&to: the instants the tutor is already booked in that window, so the
// slot picker can grey them out. Only instants are returned: nothing about who booked or why.
export const GET = handleWithParams<{ id: string }>(async ({ request, params, services }) => {
  const id = parse(idSchema, params.id, "Invalid tutor id");
  const { from, to } = parse(busyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return json({ data: await services.tutors.busyTimes(id, from, to) });
});
