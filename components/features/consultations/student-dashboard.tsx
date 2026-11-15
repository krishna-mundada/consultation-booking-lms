"use client";

import { LoadStateView } from "@/components/data-list/load-state-view";
import { ListToolbar, type FilterGroup } from "@/components/data-list/list-toolbar";
import { Pager } from "@/components/data-list/pager";
import { NotificationBanner } from "@/components/features/notifications/notification-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { consultationsApi } from "@/lib/api/client";
import { desc } from "@/lib/api/list-query";
import { useListScreen } from "@/lib/hooks/use-list-screen";
import { useSessionGuard } from "@/lib/hooks/use-session-guard";
import { isNarrowed, type ListDefaults } from "@/lib/list-state";
import {
  CONSULTATION_FILTER as FILTER,
  CONSULTATION_SORT as SORT,
  DEFAULT_PAGE_SIZE,
  WHEN,
} from "@/lib/schemas/consultation";
import { BookingForm } from "./booking-form";
import { STATUS_FILTER, STATUS_VALUES, WHEN_FILTER } from "./consultation-filters";
import { ConsultationList } from "./consultation-list";
import { useConsultationActions } from "./use-consultation-actions";

// The student's list stays as cards, grouped into Upcoming and Earlier, with the same server-side
// search, filters, sorting and paging as every table (ADR 0007, A22, A24).
const DEFAULTS: ListDefaults = {
  size: DEFAULT_PAGE_SIZE,
  sort: SORT.scheduledAt,
  sorts: [SORT.scheduledAt, SORT.tutorName, SORT.status],
  filters: { [FILTER.status]: STATUS_VALUES, [FILTER.when]: Object.values(WHEN) },
};

const SORT_OPTIONS = [
  { value: SORT.scheduledAt, label: "Soonest first" },
  { value: desc(SORT.scheduledAt), label: "Latest first" },
  { value: SORT.tutorName, label: "Tutor A to Z" },
  { value: desc(SORT.tutorName), label: "Tutor Z to A" },
] as const;

const FILTERS: readonly FilterGroup[] = [WHEN_FILTER, STATUS_FILTER];

export function StudentDashboard() {
  const { state, update, list } = useListScreen(DEFAULTS, consultationsApi.list);
  const actions = useConsultationActions(list.reload);
  useSessionGuard(actions.sessionExpired);

  return (
    <div className="grid gap-8 pb-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <Card className="shadow-sm lg:sticky lg:top-24">
        <CardHeader>
          <CardTitle className="font-display text-xl">Book a consultation</CardTitle>
          <CardDescription>Choose a tutor, then a time that suits you.</CardDescription>
        </CardHeader>
        <CardContent>
          <BookingForm onSubmit={actions.create} />
        </CardContent>
      </Card>

      <section className="flex min-w-0 flex-col gap-5" aria-labelledby="my-consultations">
        <div>
          <h1 id="my-consultations" className="text-3xl font-semibold">
            My consultations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">All times are Melbourne time. Tick one off when it is done.</p>
        </div>
        <NotificationBanner />
        <ListToolbar
          state={state}
          onChange={update}
          searchLabel="Search my consultations"
          searchPlaceholder="Search by tutor or reason"
          filters={FILTERS}
          sortOptions={SORT_OPTIONS}
        />
        <LoadStateView status={list.status} error={list.error} onRetry={list.retry}>
          <ConsultationList
            items={list.items}
            narrowed={isNarrowed(state)}
            onSetCompleted={actions.setCompleted}
            onReschedule={actions.reschedule}
            onCancel={actions.cancel}
          />
          <Pager
            page={state.page}
            size={state.size}
            total={list.total}
            totalPages={list.totalPages}
            onPage={(page) => update({ page })}
            onSize={(size) => update({ size })}
          />
        </LoadStateView>
      </section>
    </div>
  );
}
