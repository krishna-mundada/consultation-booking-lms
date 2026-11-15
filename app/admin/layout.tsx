import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROUTES } from "@/lib/routes";
import { isAdmin } from "@/lib/domain/roles";

// Server-side gate for the whole /admin segment. This is a UX redirect, not the security
// boundary: the admin API and the database policies refuse non-admins independently.
async function AdminGate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(ROUTES.login);
  if (!isAdmin(user.role)) redirect(ROUTES.dashboard);
  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </AppShell>
  );
}
