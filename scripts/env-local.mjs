// Writes .env.local from the running local Supabase stack so nobody copies keys by hand.
//   npm run env:local
// Refuses to overwrite an existing .env.local unless --force is passed.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const target = new URL("../.env.local", import.meta.url);
const force = process.argv.includes("--force");

if (existsSync(target) && !force) {
  console.log(".env.local already exists; leaving it alone (use --force to overwrite).");
  process.exit(0);
}

let out;
try {
  out = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  console.error("Could not read `supabase status`. Start the local stack first: `supabase start`.");
  process.exit(1);
}

const values = Object.fromEntries(
  out
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

if (!values.API_URL || !values.PUBLISHABLE_KEY) {
  console.error("`supabase status` did not report API_URL and PUBLISHABLE_KEY.");
  process.exit(1);
}

// Only the public URL and publishable key: the app never needs the secret key.
writeFileSync(
  target,
  `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${values.PUBLISHABLE_KEY}\n`,
);
console.log("Wrote .env.local (URL + publishable key only).");
