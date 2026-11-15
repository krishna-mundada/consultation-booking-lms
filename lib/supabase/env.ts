/**
 * The two public Supabase settings, read in one place and checked once. Next.js inlines
 * `process.env.NEXT_PUBLIC_*` at build time only when the property is written out literally, so
 * the names must stay spelled out here (not looked up from a variable).
 *
 * A missing value stops the app with a clear message. Carrying on without the variables would
 * turn a setup mistake into an app with no login gate and no warning.
 */
export function supabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Start Supabase (`supabase start`) and run `npm run env:local` to create .env.local.",
    );
  }
  return { url, publishableKey };
}
