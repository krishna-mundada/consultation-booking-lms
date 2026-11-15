import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "@/lib/api/http";

// A browser attaches Origin (and Sec-Fetch-Site) to cross-site writes. Refusing them backs up the
// SameSite cookie and the JSON-only content type.

const request = (method: string, headers: Record<string, string> = {}) =>
  new Request("https://app.example/api/consultations", { method, headers });

describe("isCrossSiteWrite", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("never blocks %s, which changes nothing", (method) => {
    expect(isCrossSiteWrite(request(method, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(
      false,
    );
  });

  it.each(["POST", "PATCH", "DELETE"])("allows a %s from the same origin", (method) => {
    expect(isCrossSiteWrite(request(method, { origin: "https://app.example", "sec-fetch-site": "same-origin" }))).toBe(
      false,
    );
  });

  it("allows a write that carries no browser headers (a script or server-to-server call)", () => {
    expect(isCrossSiteWrite(request("POST"))).toBe(false);
  });

  it("allows a user-initiated request the browser marks as `none`", () => {
    expect(isCrossSiteWrite(request("POST", { "sec-fetch-site": "none" }))).toBe(false);
  });

  it.each([
    ["another site", { origin: "https://evil.example" }],
    ["a sibling subdomain", { origin: "https://other.app.example" }],
    ["a different scheme", { origin: "http://app.example" }],
    ["a sandboxed page", { origin: "null" }],
    ["a browser-marked cross-site request", { "sec-fetch-site": "cross-site" }],
    ["a browser-marked same-site request", { "sec-fetch-site": "same-site" }],
  ])("blocks a write from %s", (_label, headers) => {
    expect(isCrossSiteWrite(request("POST", headers))).toBe(true);
  });
});
