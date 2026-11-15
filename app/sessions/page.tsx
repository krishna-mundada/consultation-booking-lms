import type { Metadata } from "next";
import { Suspense } from "react";
import { TutorSessionsTable } from "@/components/features/consultations/consultation-tables";

export const metadata: Metadata = { title: "Sessions with me" };

export default function SessionsPage() {
  return (
    <div className="flex flex-col gap-5 pb-8">
      <div>
        <h1 className="text-3xl font-semibold">Sessions with me</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The consultations students have booked with you. Times are Melbourne time.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <TutorSessionsTable />
      </Suspense>
    </div>
  );
}
