import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/proxy";

// Public paths skip the login redirect, so the match must stop at a path boundary.

describe("isPublicPath", () => {
  it.each(["/", "/auth", "/auth/login", "/auth/sign-up-success", "/api", "/api/consultations"])(
    "treats %s as public",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(["/dashboard", "/admin", "/authors", "/authority/x", "/apix", "/api-docs"])(
    "requires a session for %s",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
