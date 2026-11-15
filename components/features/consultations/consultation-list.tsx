"use client";

import { ContourLines } from "@/components/brand/contour";
import { hasStarted } from "@/lib/domain/consultation-rules";
import type { ApiConsultation } from "@/lib/schemas/consultation";
import { ConsultationItem } from "./consultation-item";
import type { ConsultationActions } from "./use-consultation-actions";

type ConsultationListProps = {
  items: ApiConsultation[];
  /** A search or a filter is limiting the list, so "nothing" means "nothing matched". */
  narrowed?: boolean;
  now?: Date;
} & ConsultationActions;

/**
 * The page of consultations in two groups by time alone (ADR 0007, A24): Upcoming is what has not started yet,
 * Earlier is what has. Whether it was completed or cancelled changes how a card looks, never which group it is in.
 */
export function ConsultationList({ items, narrowed = false, now = new Date(), ...actions }: ConsultationListProps) {
  if (items.length === 0) return <EmptyState narrowed={narrowed} />;

  return (
    <div className="flex flex-col gap-8">
      <Group title="Upcoming" items={items.filter((c) => !hasStarted(c, now))} now={now} {...actions} />
      <Group title="Earlier" items={items.filter((c) => hasStarted(c, now))} now={now} {...actions} />
    </div>
  );
}

function Group({
  title,
  items,
  now,
  ...actions
}: { title: string; items: ApiConsultation[]; now: Date } & ConsultationActions) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="divide-y rounded-xl border bg-card px-4 py-4 shadow-sm">
        {items.map((c) => (
          <ConsultationItem key={c.id} consultation={c} now={now} {...actions} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ narrowed }: { narrowed: boolean }) {
  return (
    <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <ContourLines className="absolute inset-0 h-full w-full text-contour opacity-70" />
      <p className="font-display relative text-lg font-semibold">
        {narrowed ? "No consultations match" : "No consultations yet"}
      </p>
      <p className="relative max-w-xs text-sm text-muted-foreground">
        {narrowed
          ? "Try a different search, or clear the filters."
          : "Choose a tutor and a time in the booking form to book your first one."}
      </p>
    </div>
  );
}
