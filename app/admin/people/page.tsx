import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleTable } from "@/components/features/people/people-table";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <div className="flex flex-col gap-5 pb-8">
      <div>
        <h1 className="text-3xl font-semibold">People</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn a student into a tutor, or back. Admins are set up by the team and cannot be changed here.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <PeopleTable />
      </Suspense>
    </div>
  );
}
