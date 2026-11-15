"use client";

import type { Column } from "@/components/data-list/data-table";
import type { FilterGroup } from "@/components/data-list/list-toolbar";
import { ServerDataTable } from "@/components/data-list/server-data-table";
import { ExpandableText } from "@/components/expandable-text";
import { consultationsApi } from "@/lib/api/client";
import { formatConsultationTime } from "@/lib/dates";
import { desc } from "@/lib/api/list-query";
import { ALL, type ListDefaults } from "@/lib/list-state";
import {
  CONSULTATION_FILTER as FILTER,
  CONSULTATION_SORT as SORT,
  DEFAULT_PAGE_SIZE,
  WHEN,
  type ApiConsultation,
} from "@/lib/schemas/consultation";
import {
  STATUS_FILTER,
  STATUS_VALUES,
  WHEN_FILTER,
  WHEN_FILTER_OPENING_ON_UPCOMING,
} from "./consultation-filters";
import { StatusBadge } from "./status-badge";

// Two read-only tables over the same rows: an admin's view of everything, and a tutor's view of the sessions
// booked with them (ADR 0007, A6, A7, A9). Nothing here can be clicked to change a consultation.

// Free text wraps anywhere instead of stretching the table, so a very long reason can never push a column off screen.
const wraps = "whitespace-normal [overflow-wrap:anywhere]";

// On a phone five columns do not fit: below `md` the first cell carries everything (who, why, status) and the
// other columns appear from `md` up. A person can still sort by When on a phone; the other headings need room.
const fromMd = "hidden md:table-cell";

/** The first cell: the time, and below `md` the rest of the row folded under it. `people` names who to show. */
const when = (people: (c: ApiConsultation) => { label: string; name: string }[]): Column<ApiConsultation> => ({
  id: "when",
  header: "When",
  sort: SORT.scheduledAt,
  className: "min-w-[8.5rem]",
  cell: (c) => (
    <div>
      <time dateTime={c.scheduled_at}>{formatConsultationTime(c.scheduled_at)}</time>
      <div className="mt-2 grid gap-1.5 text-sm md:hidden">
        <div>
          <StatusBadge consultation={c} />
        </div>
        {people(c).map((p) => (
          <div key={p.label} className={wraps}>
            <span className="text-muted-foreground">{p.label}: </span>
            {p.name}
          </div>
        ))}
        <div className={`${wraps} text-muted-foreground`}>
          {c.reason ? <ExpandableText text={c.reason} limit={100} /> : "No reason given"}
        </div>
      </div>
    </div>
  ),
});

const reason: Column<ApiConsultation> = {
  id: "reason",
  header: "Reason",
  className: `${wraps} ${fromMd} min-w-[10rem]`,
  cell: (c) => (c.reason ? <ExpandableText text={c.reason} limit={100} /> : <span className="text-muted-foreground">No reason given</span>),
};

const status: Column<ApiConsultation> = {
  id: "status",
  header: "Status",
  sort: SORT.status,
  className: fromMd,
  cell: (c) => <StatusBadge consultation={c} />,
};

const person = (id: string, header: string, sort: string, name: (c: ApiConsultation) => string): Column<ApiConsultation> => ({
  id,
  header,
  sort,
  className: `${wraps} ${fromMd} min-w-[7rem]`,
  cell: (c) => name(c),
});

const noun = { one: "consultation", other: "consultations" };
const caption = "Consultations";

const ADMIN_DEFAULTS: ListDefaults = {
  size: DEFAULT_PAGE_SIZE,
  sort: desc(SORT.scheduledAt),
  sorts: [SORT.scheduledAt, SORT.tutorName, SORT.studentName, SORT.status],
  filters: { [FILTER.status]: STATUS_VALUES, [FILTER.when]: Object.values(WHEN) },
};

const adminFilters: readonly FilterGroup[] = [WHEN_FILTER, STATUS_FILTER];

/** Every consultation, for an admin: read-only, searchable by student, tutor or reason. */
export function AdminConsultationsTable() {
  return (
    <ServerDataTable
      defaults={ADMIN_DEFAULTS}
      fetcher={consultationsApi.listAll}
      columns={() => [
        when((c) => [
          { label: "Tutor", name: c.tutor_name },
          { label: "Student", name: c.student_name },
        ]),
        person("tutor", "Tutor", SORT.tutorName, (c) => c.tutor_name),
        person("student", "Student", SORT.studentName, (c) => c.student_name),
        reason,
        status,
      ]}
      rowKey={(c) => c.id}
      caption={caption}
      searchLabel="Search consultations"
      searchPlaceholder="Search by student, tutor or reason"
      filters={adminFilters}
      empty={{
        none: "No consultations yet.",
        noMatch: "No consultations match. Try a different search, or clear the filters.",
      }}
      noun={noun}
    />
  );
}

// A tutor opens on what is still to come; "All" and "Past" are one click away.
const TUTOR_DEFAULTS: ListDefaults = {
  size: DEFAULT_PAGE_SIZE,
  sort: SORT.scheduledAt,
  sorts: [SORT.scheduledAt, SORT.studentName, SORT.status],
  filters: { [FILTER.status]: STATUS_VALUES, [FILTER.when]: [...Object.values(WHEN), ALL] },
  initial: { [FILTER.when]: WHEN.upcoming },
};

const tutorFilters: readonly FilterGroup[] = [WHEN_FILTER_OPENING_ON_UPCOMING, STATUS_FILTER];

/** The consultations booked with the signed-in tutor ("Sessions with me"): view only. */
export function TutorSessionsTable() {
  return (
    <ServerDataTable
      defaults={TUTOR_DEFAULTS}
      fetcher={consultationsApi.sessions}
      columns={() => [
        when((c) => [{ label: "Student", name: c.student_name }]),
        person("student", "Student", SORT.studentName, (c) => c.student_name),
        reason,
        status,
      ]}
      rowKey={(c) => c.id}
      caption="Sessions with me"
      searchLabel="Search sessions"
      searchPlaceholder="Search by student or reason"
      filters={tutorFilters}
      empty={{
        none: "No upcoming sessions. When a student books you, it shows up here.",
        noMatch: "No sessions match. Try a different search, or choose All.",
      }}
      noun={{ one: "session", other: "sessions" }}
    />
  );
}
