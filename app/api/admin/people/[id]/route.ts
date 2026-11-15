import { handleWithParams, json, parse, readJson } from "@/lib/api/handler";
import { idSchema } from "@/lib/schemas/consultation";
import { setTutorSchema } from "@/lib/schemas/people";

// PATCH /api/admin/people/:id: make a student a tutor, or take it away (ADR 0007, A4, A8).
// Turning a tutor off while they have upcoming consultations needs `cancel_upcoming` (true cancels
// them and notifies the students, false keeps them); without it the answer is 409.
export const PATCH = handleWithParams<{ id: string }>(async ({ request, params, services }) => {
  const id = parse(idSchema, params.id, "Invalid person id");
  const input = parse(setTutorSchema, await readJson(request));
  return json({ data: await services.people.setTutor(id, input) });
});
