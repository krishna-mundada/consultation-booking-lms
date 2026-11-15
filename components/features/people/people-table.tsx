"use client";

import { useState } from "react";
import type { Column } from "@/components/data-list/data-table";
import type { FilterGroup } from "@/components/data-list/list-toolbar";
import { ServerDataTable } from "@/components/data-list/server-data-table";
import { Badge } from "@/components/ui/badge";
import { peopleApi } from "@/lib/api/client";
import { ROLE } from "@/lib/domain/roles";
import type { ListDefaults } from "@/lib/list-state";
import { DEFAULT_PAGE_SIZE } from "@/lib/schemas/consultation";
import { PEOPLE_FILTER, PEOPLE_SORT, type Person, type SetTutorResult } from "@/lib/schemas/people";
import { TutorSwitch } from "./tutor-switch";

// Everyone, with the one control an admin needs: whether they are a tutor (ADR 0007, A4, A5, A21).
// Admins have no switch: they are seeded in code and never change here.

const DEFAULTS: ListDefaults = {
  size: DEFAULT_PAGE_SIZE,
  sort: PEOPLE_SORT.name,
  sorts: Object.values(PEOPLE_SORT),
  filters: { [PEOPLE_FILTER.role]: Object.values(ROLE) },
};

const FILTERS: readonly FilterGroup[] = [
  {
    name: PEOPLE_FILTER.role,
    label: "Show",
    options: [
      { value: "", label: "Everyone" },
      { value: ROLE.student, label: "Students" },
      { value: ROLE.tutor, label: "Tutors" },
      { value: ROLE.admin, label: "Admins" },
    ],
  },
];

const ROLE_LABEL = { [ROLE.student]: "Student", [ROLE.tutor]: "Tutor", [ROLE.admin]: "Admin" } as const;

const wraps = "whitespace-normal [overflow-wrap:anywhere]";

/** What the admin did, in words, for the status line above the table. */
function describeChange(person: Person, result: SetTutorResult): string {
  if (result.role === ROLE.tutor) return `${person.display_name} is now a tutor and can be booked.`;
  if (result.cancelled > 0) {
    const them = result.cancelled === 1 ? "1 upcoming consultation was" : `${result.cancelled} upcoming consultations were`;
    return `${person.display_name} is no longer a tutor. ${them} cancelled and the students notified.`;
  }
  if (result.upcoming > 0) {
    return `${person.display_name} is no longer a tutor. Their upcoming consultations were kept.`;
  }
  return `${person.display_name} is no longer a tutor.`;
}

export function PeopleTable() {
  const [notice, setNotice] = useState("");

  const columns = (reload: () => void): readonly Column<Person>[] => [
    { id: "name", header: "Name", sort: PEOPLE_SORT.name, className: `${wraps} min-w-[8rem] font-medium`, cell: (p) => p.display_name },
    { id: "email", header: "Email", sort: PEOPLE_SORT.email, className: `${wraps} min-w-[10rem]`, cell: (p) => p.email },
    {
      id: "role",
      header: "Role",
      sort: PEOPLE_SORT.role,
      cell: (p) => <Badge variant={p.role === ROLE.admin ? "secondary" : "outline"}>{ROLE_LABEL[p.role]}</Badge>,
    },
    {
      id: "upcoming",
      header: "Upcoming",
      sort: PEOPLE_SORT.upcoming,
      className: "tabular-nums",
      cell: (p) => (p.role === ROLE.admin ? <span className="text-muted-foreground">–</span> : p.upcoming),
    },
    {
      id: "tutor",
      header: "Tutor",
      cell: (p) =>
        p.role === ROLE.admin ? (
          <span className="text-sm text-muted-foreground">Admin</span>
        ) : (
          <TutorSwitch
            person={p}
            onChanged={(result, person) => {
              setNotice(describeChange(person, result));
              reload();
            }}
          />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* The live region exists before its text does, so screen readers announce the change. */}
      <p role="status" className="text-sm font-medium text-primary empty:hidden">
        {notice}
      </p>
      <ServerDataTable
        defaults={DEFAULTS}
        fetcher={peopleApi.list}
        columns={columns}
        rowKey={(p) => p.id}
        caption="People"
        searchLabel="Search people"
        searchPlaceholder="Search by name or email"
        filters={FILTERS}
        empty={{ none: "No one has signed up yet.", noMatch: "No one matches. Try a different search, or choose Everyone." }}
        noun={{ one: "person", other: "people" }}
      />
    </div>
  );
}
