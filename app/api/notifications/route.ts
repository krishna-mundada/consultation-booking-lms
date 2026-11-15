import { handle, json } from "@/lib/api/handler";
import { parseListQuery } from "@/lib/api/list-query";
import { NOTIFICATION_LIST } from "@/lib/services/notifications";

// GET /api/notifications: the caller's own, newest first. `filter[read]=false` is the unread banner.
export const GET = handle(async ({ request, services }) => {
  const query = parseListQuery(NOTIFICATION_LIST, new URL(request.url).searchParams);
  return json(await services.notifications.list(query));
});
