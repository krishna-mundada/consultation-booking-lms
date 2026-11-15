import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminConsultationsTable } from "@/components/features/consultations/consultation-tables";

export const metadata: Metadata = { title: "All consultations" };

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-5 pb-8">
      <div>
        <h1 className="text-3xl font-semibold">All consultations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view across every student and tutor. Times are Melbourne time.
        </p>
      </div>
      {/* The table reads its state from the URL, which is a request-time read. */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AdminConsultationsTable />
      </Suspense>
    </div>
  );
}
