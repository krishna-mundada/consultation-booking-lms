import { cache } from "react";
import { fetchRole } from "@/lib/auth/fetch-role";
import type { Role } from "@/lib/domain/roles";
import { createClient } from "@/lib/supabase/server";

type CurrentUser = { id: string; email: string | undefined; role: Role | null };

/**
 * The signed-in user and their role, or null when signed out. Uses getUser() so the session is
 * re-validated with the Auth server (ADR 0003). Used to shape navigation and to gate /admin
 * pages; the API and the database enforce access independently, so this is UX, not the boundary.
 *
 * Wrapped in React's cache(): the nav and the admin gate both ask in the same request, and
 * without it each would make its own round trips to the Auth server and the database.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  // A failed lookup leaves the role null, which has no capabilities (fetchRole's contract).
  const { role } = await fetchRole(supabase, user.id);
  return { id: user.id, email: user.email, role };
});
