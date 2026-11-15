import { execFileSync } from "node:child_process";

// Tests run against the local Supabase stack (`supabase start`). Keys come from the
// environment (CI) or, failing that, from `supabase status`. Idempotent and cheap after
// the first call.
export function loadSupabaseEnv(): void {
  if (
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SECRET_KEY
  ) {
    return;
  }

  let out: string;
  try {
    out = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Could not read Supabase status. Start the local stack first: `supabase start`.");
  }

  const values = Object.fromEntries(
    out
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );

  process.env.SUPABASE_URL ??= values.API_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY ??= values.PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY ??= values.SECRET_KEY;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("`supabase status` did not report API_URL, PUBLISHABLE_KEY and SECRET_KEY.");
  }
}
