import { CalendarClock, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { consultationTone, toneState, type Tone } from "@/lib/domain/consultation-rules";
import type { ApiConsultation } from "@/lib/schemas/consultation";
import { cn } from "@/lib/utils";
import { STATE_LABEL } from "./consultation-filters";

// One place decides how a consultation's state is labelled and coloured, so the student list and the admin
// and tutor tables can never disagree (docs/conventions.md C2). The label always carries the meaning; the
// colour and icon only reinforce it.
const badge = "gap-1 border-transparent shadow-none";

const LOOK: Record<Tone, { icon: ReactNode; className: string }> = {
  upcoming: {
    icon: <CalendarClock className="h-3 w-3" aria-hidden="true" />,
    className: "bg-accent text-accent-foreground",
  },
  // Today is still "Scheduled": the badge uses the four words a list sorts and filters by. The date tile
  // is what stands out for today.
  today: {
    icon: <CalendarClock className="h-3 w-3" aria-hidden="true" />,
    className: "bg-accent text-accent-foreground",
  },
  complete: {
    icon: <CircleCheck className="h-3 w-3" aria-hidden="true" />,
    className: "bg-muted text-muted-foreground",
  },
  awaiting: {
    icon: <CircleAlert className="h-3 w-3" aria-hidden="true" />,
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  cancelled: {
    icon: <CircleX className="h-3 w-3" aria-hidden="true" />,
    className: "bg-destructive-text/10 text-destructive-text",
  },
};

export function StatusBadge({
  consultation,
  now = new Date(),
}: {
  consultation: Pick<ApiConsultation, "status" | "completed" | "scheduled_at">;
  now?: Date;
}) {
  const tone = consultationTone(consultation, now);
  const look = LOOK[tone];
  return (
    <Badge className={cn(badge, look.className)}>
      {look.icon}
      {STATE_LABEL[toneState(tone)]}
    </Badge>
  );
}
