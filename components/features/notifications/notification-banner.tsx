"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { notificationsApi } from "@/lib/api/client";
import { desc } from "@/lib/api/list-query";
import { formatConsultationTime } from "@/lib/dates";
import { describeError } from "@/lib/hooks/outcome";
import { toApiQuery } from "@/lib/list-state";
import { NOTIFICATION_FILTER, NOTIFICATION_SORT, READ_STATE, type Notification } from "@/lib/schemas/notifications";

const SHOWN = 5;

/**
 * The words for a notification (ADR 0007, A10, A18). The database stores the facts (who, when); the app words
 * them, so the wording and the time zone are the app's to change. It never repeats the consultation's reason.
 */
export function notificationText(n: Pick<Notification, "kind" | "tutor_name" | "consultation_at">): string {
  return `Your consultation with ${n.tutor_name} on ${formatConsultationTime(n.consultation_at)} was cancelled because the tutor is no longer available.`;
}

type State = { notices: Notification[]; total: number } | { error: string } | null;

/**
 * Unread notices, newest first, each shown until the student dismisses it. It renders nothing when there is
 * nothing to say, so a student with no notices sees no extra space.
 */
export function NotificationBanner() {
  const [state, setState] = useState<State>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dismissError, setDismissError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const query = toApiQuery({
      page: 1,
      size: SHOWN,
      sort: desc(NOTIFICATION_SORT.createdAt),
      q: "",
      filters: { [NOTIFICATION_FILTER.read]: READ_STATE.unread },
    });
    notificationsApi.list(query).then(
      (page) => !ignore && setState({ notices: page.data, total: page.meta.page.total }),
      (failure: unknown) => !ignore && setState({ error: describeError(failure).message }),
    );
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const dismiss = useCallback(async (id: string) => {
    setDismissError(null);
    try {
      await notificationsApi.markRead(id);
      setReloadKey((key) => key + 1);
    } catch (failure) {
      setDismissError(describeError(failure).message);
    }
  }, []);

  if (!state) return null;
  if ("error" in state) return <ErrorMessage>{state.error}</ErrorMessage>;
  if (state.notices.length === 0) return null;

  const more = state.total - state.notices.length;
  return (
    <section aria-label="Notices" className="grid gap-2">
      <ul className="grid gap-2">
        {state.notices.map((notice) => (
          <li
            key={notice.id}
            className="flex items-start gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground"
          >
            <Bell className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{notificationText(notice)}</p>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Dismiss: your consultation with ${notice.tutor_name} was cancelled`}
              onClick={() => void dismiss(notice.id)}
            >
              Dismiss
            </Button>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-xs text-muted-foreground">And {more} more. Dismiss these to see them.</p>}
      {dismissError && <ErrorMessage>{dismissError}</ErrorMessage>}
    </section>
  );
}
