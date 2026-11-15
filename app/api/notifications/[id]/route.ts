import { handleWithParams, json, parse, readJson } from "@/lib/api/handler";
import { idSchema } from "@/lib/schemas/consultation";
import { markReadSchema } from "@/lib/schemas/notifications";

// PATCH /api/notifications/:id with { "read": true }: dismiss one of the caller's notifications.
export const PATCH = handleWithParams<{ id: string }>(async ({ request, params, services }) => {
  const id = parse(idSchema, params.id, "Invalid notification id");
  parse(markReadSchema, await readJson(request));
  return json({ data: await services.notifications.markRead(id) });
});
