import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/domain/roles";
import { ROUTES } from "@/lib/routes";

// Sessions with me: for tutors, and for a former tutor who still has some on record (ADR 0007, A7). Anyone
// else simply sees an empty list. Admins have their own screens. This is UX: the API returns only the rows
// where the caller is the tutor, whoever asks.
async function SessionsGate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(ROUTES.login);
  if (isAdmin(user.role)) redirect(ROUTES.admin);
  return <>{children}</>;
}

export default function SessionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SessionsGate>{children}</SessionsGate>
      </Suspense>
    </AppShell>
  );
}
