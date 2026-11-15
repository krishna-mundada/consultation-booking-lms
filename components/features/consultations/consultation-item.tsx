"use client";

import { useRef, useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { ExpandableText } from "@/components/expandable-text";
import { Checkbox } from "@/components/ui/checkbox";
import { formatConsultationTime, relativeDay } from "@/lib/dates";
import { consultationTone } from "@/lib/domain/consultation-rules";
import type { Outcome } from "@/lib/hooks/outcome";
import type { ApiConsultation } from "@/lib/schemas/consultation";
import { cn } from "@/lib/utils";
import { CancelDialog } from "./cancel-dialog";
import { DateTile } from "./date-tile";
import { RescheduleDialog } from "./reschedule-dialog";
import { StatusBadge } from "./status-badge";
import type { ConsultationActions } from "./use-consultation-actions";

type ConsultationItemProps = { consultation: ApiConsultation; now?: Date } & ConsultationActions;

/** One of a student's consultations: when, with whom, and what they can still do with it. */
export function ConsultationItem({
  consultation: c,
  now = new Date(),
  onSetCompleted,
  onReschedule,
  onCancel,
}: ConsultationItemProps) {
  const [error, setError] = useState<string | null>(null);
  const itemRef = useRef<HTMLLIElement>(null);
  const cancelConfirmed = useRef(false);
  const tone = consultationTone(c, now);
  const cancelled = tone === "cancelled";
  // Done with: nothing more will happen to it, so it fades back.
  const finished = cancelled || tone === "complete";
  // Only one that is still to come gets a "Tomorrow" style cue.
  const when = tone === "today" || tone === "upcoming" ? relativeDay(c.scheduled_at, now) : null;
  const label = `with ${c.tutor_name} on ${formatConsultationTime(c.scheduled_at)}`;
  // Why Completed is switched off, when it is only because the time has not come.
  const notYet = !c.can_complete && !cancelled && c.status === "scheduled" && (tone === "today" || tone === "upcoming");

  async function run(action: Promise<Outcome>) {
    const outcome = await action;
    setError(outcome.ok ? null : outcome.message);
  }

  function confirmCancel() {
    cancelConfirmed.current = true;
    void run(onCancel(c.id));
  }

  function focusRowAfterCancel(): boolean {
    if (!cancelConfirmed.current) return false;
    cancelConfirmed.current = false;
    itemRef.current?.focus();
    return true;
  }

  return (
    // tabIndex -1: focusable from code (to land here after a cancel) but not a tab stop.
    <li ref={itemRef} tabIndex={-1} className="flex gap-4 py-4 outline-none first:pt-0 last:pb-0">
      <DateTile iso={c.scheduled_at} tone={tone} />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          {/* min-w-0 + overflow-wrap: a long unbroken name or reason must wrap inside the row, not push the badge out */}
          <div className="flex min-w-0 flex-1 basis-44 flex-col gap-0.5">
            <span
              className={cn(
                "[overflow-wrap:anywhere]",
                finished ? "text-muted-foreground" : "font-medium",
                cancelled && "line-through",
              )}
            >
              With {c.tutor_name}
            </span>
            <span className={cn("text-sm", finished && "text-muted-foreground")}>
              <time dateTime={c.scheduled_at}>{formatConsultationTime(c.scheduled_at)}</time>
              {when && <span className="ml-2 font-medium text-primary">{when}</span>}
            </span>
            <span className={cn("text-sm text-muted-foreground", !c.reason && "italic")}>
              {c.reason ? <ExpandableText text={c.reason} /> : "No reason given"}
            </span>
          </div>
          <div className="shrink-0">
            <StatusBadge consultation={c} now={now} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 text-sm">
            {/* Switched off: a muted text colour, not opacity (dimmed text fails contrast); the checkbox dims itself. */}
            <label className={cn("flex items-center gap-2", c.can_complete ? "cursor-pointer" : "cursor-not-allowed text-muted-foreground")}>
              <Checkbox
                // A cancelled booking is never shown as ticked, even if it had been completed first.
                checked={c.completed && !cancelled}
                disabled={!c.can_complete}
                aria-label={`Completed: ${label}`}
                onCheckedChange={(checked) => void run(onSetCompleted(c.id, checked === true))}
              />
              Completed
            </label>
            {/* Outside the dimmed label: dimming text would drop it below the contrast it needs. */}
            {notYet && <span className="text-xs text-muted-foreground">(after it starts)</span>}
          </div>
          {c.can_edit && (
            <div className="flex flex-wrap gap-2">
              <RescheduleDialog consultation={c} onReschedule={onReschedule} />
              <CancelDialog consultation={c} onConfirm={confirmCancel} onClosedAfterConfirm={focusRowAfterCancel} />
            </div>
          )}
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
      </div>
    </li>
  );
}
