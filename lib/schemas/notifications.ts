import { z } from "zod";

// In-app notifications (ADR 0007, A8, A10, A18). A row records a fact; the app words it, so wording
// and time zone are the app's business.

/** What the notifications list is sorted and filtered by, and the two values of the `read` filter. */
export const NOTIFICATION_SORT = { createdAt: "created_at" } as const;
export const NOTIFICATION_FILTER = { read: "read" } as const;
export const READ_STATE = { read: "true", unread: "false" } as const;

const notificationKindSchema = z.enum(["consultation_cancelled"]);

export const notificationSchema = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  tutor_name: z.string(),
  consultation_at: z.string(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** The only change a user can make to a notification: mark it read. */
export const markReadSchema = z.object({ read: z.literal(true) });
