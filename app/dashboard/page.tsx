import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentDashboard } from "@/components/features/consultations/student-dashboard";

export const metadata: Metadata = { title: "My consultations" };

export default function DashboardPage() {
  // The list reads its state from the URL, which is a request-time read.
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <StudentDashboard />
    </Suspense>
  );
}
