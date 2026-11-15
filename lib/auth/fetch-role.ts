import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { parseRole, type Role } from "@/lib/domain/roles";
import type { Database } from "@/types/database";

/**
 * The one place that reads a user's role. Both the page guards and the service use it, so the
 * lookup cannot drift between them. The role is read with the caller's own client: RLS lets a
 * user read only their own profile.
 *
 * A missing profile, an unknown value or a database error all resolve to no role, which has no
 * capabilities; the error is returned too so a caller that must not guess (the API) can refuse.
 */
export async function fetchRole(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<{ role: Role | null; error: PostgrestError | null }> {
  const { data, error } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  return { role: parseRole(data?.role), error };
}
