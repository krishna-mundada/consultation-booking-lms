import { handleWithParams, json, parse, readJson } from "@/lib/api/handler";
import { MESSAGES } from "@/lib/messages";
import { CONSULTATION_ACTION, idSchema, updateConsultationSchema } from "@/lib/schemas/consultation";

// PATCH /api/consultations/:id: reschedule | set_completed | cancel (AC-3, AC-5, AC-6).
export const PATCH = handleWithParams<{ id: string }>(async ({ request, params, services }) => {
  const id = parse(idSchema, params.id, "Invalid consultation id");
  const input = parse(updateConsultationSchema, await readJson(request), MESSAGES.invalidRequest);

  switch (input.action) {
    case CONSULTATION_ACTION.reschedule:
      return json({ data: await services.consultations.reschedule(id, input.scheduled_at) });
    case CONSULTATION_ACTION.setCompleted:
      return json({ data: await services.consultations.setCompleted(id, input.completed) });
    case CONSULTATION_ACTION.cancel:
      return json({ data: await services.consultations.cancel(id) });
    default: {
      // Adding an action to the schema without handling it here becomes a compile error.
      const unhandled: never = input;
      throw new Error(`Unhandled action: ${JSON.stringify(unhandled)}`);
    }
  }
});
