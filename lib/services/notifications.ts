import { applyListQuery, desc, pageOf, pageRange, type ListSpec, type ParsedList } from "@/lib/api/list-query";
import { NotFoundError } from "@/lib/errors";
import type { Page } from "@/lib/schemas/api";
import {
  NOTIFICATION_FILTER,
  NOTIFICATION_SORT,
  READ_STATE,
  notificationSchema,
  type Notification,
} from "@/lib/schemas/notifications";
import { fail, type Access, type Db } from "./access";

// A user's own notifications (ADR 0007, A10, A18): shown until dismissed, and dismissing is the only
// change they can make. Rows are written by the database functions, never by the app.

/** Newest first; `filter[read]=false` is the unread banner. */
export const NOTIFICATION_LIST = {
  sorts: { [NOTIFICATION_SORT.createdAt]: "created_at" },
  defaultSort: desc(NOTIFICATION_SORT.createdAt),
  filters: {
    [NOTIFICATION_FILTER.read]: {
      column: "read_at",
      kind: { kind: "enum", values: Object.values(READ_STATE) },
      ops: ["eq"],
      apply: (query, value) =>
        value === READ_STATE.read ? query.not("read_at", "is", null) : query.is("read_at", null),
    },
  },
} satisfies ListSpec;

export function createNotificationsService(db: Db, access: Access) {
  return {
    async list(parsed: ParsedList): Promise<Page<Notification>> {
      const query = applyListQuery(
        db.from("notifications").select("*", { count: "exact" }).eq("user_id", access.userId),
        parsed,
        NOTIFICATION_LIST,
      );
      const { from, to } = pageRange(parsed);
      const { data, error, count } = await query.range(from, to);
      if (error?.code === "PGRST103") return pageOf([], parsed, 0);
      if (error) fail("list notifications", error);
      return pageOf(notificationSchema.array().parse(data ?? []), parsed, count ?? 0);
    },

    /** Dismisses one of the caller's notifications. Dismissing it again is fine. */
    async markRead(id: string): Promise<Notification> {
      const { data, error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", access.userId)
        .is("read_at", null)
        .select("*")
        .maybeSingle();
      if (error) fail("mark read", error);
      if (data) return notificationSchema.parse(data);

      // Nothing was unread under that id: it is already read, or it is not theirs.
      const { data: existing, error: lookupError } = await db
        .from("notifications")
        .select("*")
        .eq("id", id)
        .eq("user_id", access.userId)
        .maybeSingle();
      if (lookupError) fail("read notification", lookupError);
      if (!existing) throw new NotFoundError("Notification not found");
      return notificationSchema.parse(existing);
    },
  };
}

