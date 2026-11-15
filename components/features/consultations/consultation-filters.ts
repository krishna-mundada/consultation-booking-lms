import type { FilterGroup } from "@/components/data-list/list-toolbar";
import { ALL } from "@/lib/list-state";
import { CONSULTATION_FILTER, CONSULTATION_STATE, WHEN, type ConsultationState } from "@/lib/schemas/consultation";

// The words a consultation's state and timing are shown with, and the filter buttons built from them. Defined once
// so the badge, the Status filter on every list and the When filter can never disagree (ADR 0007, A31).

export const STATE_LABEL: Record<ConsultationState, string> = {
  [CONSULTATION_STATE.scheduled]: "Scheduled",
  [CONSULTATION_STATE.awaiting]: "Not marked complete",
  [CONSULTATION_STATE.complete]: "Complete",
  [CONSULTATION_STATE.cancelled]: "Cancelled",
};

export const WHEN_LABEL: Record<(typeof WHEN)[keyof typeof WHEN], string> = {
  [WHEN.upcoming]: "Upcoming",
  [WHEN.past]: "Past",
};

/** Every state's value, for the list defaults that say which Status values the screen understands. */
export const STATUS_VALUES: readonly string[] = Object.values(CONSULTATION_STATE);

export const STATUS_FILTER: FilterGroup = {
  name: CONSULTATION_FILTER.status,
  label: "Status",
  options: [
    { value: "", label: "All" },
    ...Object.values(CONSULTATION_STATE).map((state) => ({ value: state, label: STATE_LABEL[state] })),
  ],
};

/** All, Upcoming, Past. */
export const WHEN_FILTER: FilterGroup = {
  name: CONSULTATION_FILTER.when,
  label: "When",
  options: [
    { value: "", label: "All" },
    { value: WHEN.upcoming, label: WHEN_LABEL[WHEN.upcoming] },
    { value: WHEN.past, label: WHEN_LABEL[WHEN.past] },
  ],
};

/** Upcoming, Past, All: for a list that opens on what is still to come ("All" is the explicit "no filter"). */
export const WHEN_FILTER_OPENING_ON_UPCOMING: FilterGroup = {
  ...WHEN_FILTER,
  options: [
    { value: WHEN.upcoming, label: WHEN_LABEL[WHEN.upcoming] },
    { value: WHEN.past, label: WHEN_LABEL[WHEN.past] },
    { value: ALL, label: "All" },
  ],
};
