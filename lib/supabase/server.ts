import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  // Reading a session is inherently per-request. Marking it dynamic first stops Next from
  // treating Supabase's internal time/random reads as prerenderable values (they would
  // otherwise be flagged as "unstable" with Cache Components + Partial Prefetching).
  await connection();
  const cookieStore = await cookies();

  const { url, publishableKey } = supabaseEnv();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll was called from a Server Component, which cannot set cookies. Ignoring that
          // is safe because the proxy refreshes the session on every request.
        }
      },
    },
  });
}
