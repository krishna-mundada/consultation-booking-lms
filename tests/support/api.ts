import { createServerClient } from "@supabase/ssr";
import { request, type APIRequestContext } from "@playwright/test";
import { loadSupabaseEnv } from "./env";
import { createTestUser, type TestRole, type TestUser } from "./supabase";

// Signs in with @supabase/ssr itself and captures the cookies it would set, so cookie names
// and chunking are exactly what the app's own client expects (no hand-built format).
export async function signInCookieHeader(email: string, password: string): Promise<string> {
  loadSupabaseEnv();
  const jar = new Map<string, string>();
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  if (jar.size === 0) throw new Error("no session cookies were produced");
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

export type ApiActor = { user: TestUser; api: APIRequestContext };

/** A fresh user plus an HTTP client that is signed in as them against the running app. */
export async function apiActor(baseURL: string, role: TestRole = "student"): Promise<ApiActor> {
  const user = await createTestUser(role);
  const cookie = await signInCookieHeader(user.email, user.password);
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { cookie } });
  return { user, api };
}

export async function anonymousApi(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL });
}
