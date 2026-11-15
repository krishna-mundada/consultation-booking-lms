import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Guards for architectural claims in the ADRs, so they cannot quietly stop being true.

const root = path.resolve(import.meta.dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

const appCode = ["app", "components", "lib"].flatMap(sourceFiles);

describe("ADR 0002/0003: the running app never uses the service-role key", () => {
  it("no application file references the secret key or the service role", () => {
    const offenders = appCode.filter((file) =>
      /SUPABASE_SECRET_KEY|SERVICE_ROLE|service_role|sb_secret_/.test(readFileSync(path.join(root, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no application file reads the secret key from a NEXT_PUBLIC_ variable", () => {
    const offenders = appCode.filter((file) =>
      /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE)/.test(readFileSync(path.join(root, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("AC-16: APIs over Server Actions", () => {
  it("no file in the app declares a Server Action ('use server')", () => {
    const offenders = appCode.filter((file) => /['"]use server['"]/.test(readFileSync(path.join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
