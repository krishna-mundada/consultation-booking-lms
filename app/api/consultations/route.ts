import { handle, json, parse, readJson } from "@/lib/api/handler";
import { parseListQuery } from "@/lib/api/list-query";
import { HTTP_STATUS } from "@/lib/errors";
import { createConsultationSchema } from "@/lib/schemas/consultation";
import { STUDENT_LIST } from "@/lib/services/consultations";

// GET /api/consultations: the caller's own consultations, with the shared list convention
// (page[number], page[size], sort, filter[...]); docs/architecture.md section 6 (AC-2, AC-8).
export const GET = handle(async ({ request, services }) => {
  const query = parseListQuery(STUDENT_LIST, new URL(request.url).searchParams);
  return json(await services.consultations.listOwn(query));
});

// POST /api/consultations: book a consultation with a tutor, for the caller (AC-4).
export const POST = handle(async ({ request, services }) => {
  const input = parse(createConsultationSchema, await readJson(request));
  return json({ data: await services.consultations.create(input) }, HTTP_STATUS.created);
});
