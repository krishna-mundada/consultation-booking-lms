import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseEnv } from "@/lib/supabase/env";

// A missing variable must stop the app with a clear message. Silently carrying on would skip the
// auth redirect, which is a fail-open default.

afterEach(() => vi.unstubAllEnvs());

describe("supabaseEnv", () => {
  it("returns the URL and publishable key when both are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example");
    expect(supabaseEnv()).toEqual({ url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_example" });
  });

  it.each([
    ["URL", "NEXT_PUBLIC_SUPABASE_URL"],
    ["publishable key", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  ])("throws a helpful error when the %s is missing", (_label, missing) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example");
    vi.stubEnv(missing, "");
    expect(() => supabaseEnv()).toThrow(/npm run env:local/);
  });

  it("names both variables so the fix is obvious", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});
