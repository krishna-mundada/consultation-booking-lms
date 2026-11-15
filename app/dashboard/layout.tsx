import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdmin, isTutor } from "@/lib/domain/roles";
import { ROUTES } from "@/lib/routes";

// The dashboard is where students book and manage consultations. Tutors and admins hold no booking
// capability (ADR 0007, A9), so each is sent to their own screen. This is a UX redirect: the API and the
// database policies refuse their writes independently.
async function StudentGate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (isAdmin(user?.role)) redirect(ROUTES.admin);
  if (isTutor(user?.role)) redirect(ROUTES.sessions);
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <StudentGate>{children}</StudentGate>
      </Suspense>
    </AppShell>
  );
}
