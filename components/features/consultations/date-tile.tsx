import { calendarParts } from "@/lib/dates";
import type { Tone } from "@/lib/domain/consultation-rules";
import { cn } from "@/lib/utils";

// The tile's colour says where the consultation stands, matching its badge: strong for today, soft for a
// later day, grey once done, amber when its time has come but it is not marked complete, dashed for cancelled.
const TONE: Record<Tone, string> = {
  today: "border-primary bg-primary text-primary-foreground",
  upcoming: "border-accent-foreground/15 bg-accent text-accent-foreground",
  complete: "border-border bg-muted text-muted-foreground",
  awaiting: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  cancelled: "border-dashed border-border bg-muted/50 text-muted-foreground",
};

/**
 * The day of a consultation as a small calendar tile, so a list reads as a schedule at a glance.
 * It is purely visual: the full date and time sit next to it in a <time> element.
 */
export function DateTile({ iso, tone }: { iso: string; tone: Tone }) {
  const { weekday, day, month } = calendarParts(iso);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-[4.75rem] w-[3.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2",
        TONE[tone],
      )}
    >
      <span className="text-xs font-medium leading-none">{weekday}</span>
      <span className="font-display text-2xl font-semibold leading-none">{day}</span>
      <span className="text-xs leading-none">{month}</span>
    </div>
  );
}
