import Link from "next/link";
import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { ContourMark } from "@/components/brand/contour";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROLE } from "@/lib/domain/roles";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

const linkClass =
  "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/** Does anyone have a consultation booked with this user as the tutor? (RLS shows only their own.) */
async function hasSessions(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("consultations")
    .select("id", { count: "exact", head: true })
    .eq("tutor_id", userId);
  return (count ?? 0) > 0;
}

// What each role can go to (ADR 0007). Reads the session, so it must sit inside <Suspense> (Cache Components).
// A former tutor keeps a link to the sessions they still have on record (A7).
async function NavLinks() {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role === ROLE.admin) {
    return (
      <>
        <Link href={ROUTES.admin} className={linkClass}>
          Consultations
        </Link>
        <Link href={ROUTES.adminPeople} className={linkClass}>
          People
        </Link>
      </>
    );
  }
  if (user.role === ROLE.tutor) {
    return (
      <Link href={ROUTES.sessions} className={linkClass}>
        Sessions with me
      </Link>
    );
  }
  return (
    <>
      <Link href={ROUTES.dashboard} className={linkClass}>
        My consultations
      </Link>
      {(await hasSessions(user.id)) && (
        <Link href={ROUTES.sessions} className={linkClass}>
          Sessions with me
        </Link>
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 text-sm">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link href={ROUTES.dashboard} className="flex shrink-0 items-center gap-2.5 text-primary">
              <ContourMark />
              <span className="font-display hidden text-lg font-semibold tracking-tight text-foreground sm:inline">
                Consultations
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <Suspense>
                <NavLinks />
              </Suspense>
            </div>
          </div>
          <Suspense>
            <AuthButton />
          </Suspense>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-5 py-3">
          <ThemeSwitcher />
        </div>
      </footer>
    </div>
  );
}
