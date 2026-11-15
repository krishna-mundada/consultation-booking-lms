import { describe, expect, it } from "vitest";
import { parseOtpType, safeRedirectPath } from "@/lib/auth/safe-redirect";

// The email-confirmation link carries a `next` parameter. It must only ever send the user to a
// path on this site, never to another origin (open redirect). AC-1.

describe("safeRedirectPath", () => {
  it("allows ordinary same-site paths, including query strings", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/admin")).toBe("/admin");
    expect(safeRedirectPath("/dashboard?page=2")).toBe("/dashboard?page=2");
  });

  it("falls back when there is no value", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
  });

  it.each([
    ["an absolute URL", "https://evil.example/phish"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash trick", "/\\evil.example"],
    ["a backslash anywhere", "/ok\\evil"],
    ["a scheme with no slashes", "javascript:alert(1)"],
    ["a relative path with no leading slash", "dashboard"],
    ["control characters (header injection)", "/ok\r\nSet-Cookie: x=1"],
    ["a tab smuggled before the second slash", "/\t/evil.example"],
  ])("rejects %s", (_label, value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });

  it("uses the supplied fallback", () => {
    expect(safeRedirectPath("//evil.example", "/")).toBe("/");
  });
});

describe("parseOtpType", () => {
  // Only the links this app sends: sign-up confirmation and password recovery.
  it.each(["signup", "recovery"])("accepts %s", (type) => {
    expect(parseOtpType(type)).toBe(type);
  });

  it.each(["invite", "magiclink", "email_change", "email", null, "", "admin", "SIGNUP", "sms; drop table"])(
    "rejects %s",
    (type) => {
      expect(parseOtpType(type)).toBeNull();
    },
  );
});
