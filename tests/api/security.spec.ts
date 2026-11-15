import { expect, test } from "@playwright/test";
import { anonymousApi, apiActor } from "../support/api";
import { createTutor, uniqueSlot } from "../support/supabase";

// Production-readiness checks (security-scanning / production-validator gate).

test.describe("security headers", () => {
  for (const path of ["/auth/login", "/api/consultations"]) {
    test(`${path} sends the baseline hardening headers`, async ({ baseURL }) => {
      const api = await anonymousApi(baseURL!);
      const res = await api.get(path);
      const h = res.headers();
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["permissions-policy"]).toContain("geolocation=()");
      expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
      // The parts of a Content-Security-Policy that need no per-request nonce.
      const csp = h["content-security-policy"] ?? "";
      for (const directive of ["frame-ancestors 'none'", "form-action 'self'", "base-uri 'self'", "object-src 'none'"]) {
        expect(csp, directive).toContain(directive);
      }
    });
  }
});

test.describe("email confirmation link (open redirect and input validation)", () => {
  test("an unknown token type is refused before anything is verified", async ({ baseURL }) => {
    const api = await anonymousApi(baseURL!);
    const res = await api.get("/auth/confirm?token_hash=abc&type=admin&next=https://evil.example", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toBe("/auth/error");
  });

  test("a failed verification never redirects off-site and carries no message", async ({ baseURL }) => {
    const api = await anonymousApi(baseURL!);
    const res = await api.get("/auth/confirm?token_hash=not-a-real-token&type=signup&next=//evil.example", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toBe("/auth/error");
  });
});

test.describe("content type is enforced on writes (CSRF defence in depth)", () => {
  // A valid booking, with a tutor of its own for each test so tests never fight over a slot.
  let body = "";
  test.beforeEach(async () => {
    body = JSON.stringify({
      tutor_id: (await createTutor()).id,
      reason: "Exam prep",
      scheduled_at: uniqueSlot(),
    });
  });

  test("POST with a non-JSON content type is refused with 415", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      const res = await api.post("/api/consultations", { headers: { "content-type": contentType }, data: body });
      expect(res.status(), contentType).toBe(415);
      expect((await res.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    }
    // Nothing was created.
    const list = await api.get("/api/consultations");
    expect((await list.json()).meta.page.total).toBe(0);
  });

  test("PATCH with a non-JSON content type is refused with 415", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const created = await api.post("/api/consultations", { data: JSON.parse(body) });
    const id = (await created.json()).data.id as string;

    const res = await api.patch(`/api/consultations/${id}`, {
      headers: { "content-type": "text/plain" },
      data: JSON.stringify({ action: "cancel" }),
    });
    expect(res.status()).toBe(415);

    const after = await api.get("/api/consultations");
    expect((await after.json()).data[0].status).toBe("scheduled");
  });

  test("a write from another origin is refused with 403, even with a valid session and JSON", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const evil = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

    const create = await api.post("/api/consultations", { headers: evil, data: JSON.parse(body) });
    expect(create.status()).toBe(403);
    expect((await create.json()).error.code).toBe("FORBIDDEN");

    const own = await api.post("/api/consultations", { data: JSON.parse(body) });
    const id = (await own.json()).data.id as string;
    const patch = await api.patch(`/api/consultations/${id}`, { headers: evil, data: { action: "cancel" } });
    expect(patch.status()).toBe(403);

    const after = await (await api.get("/api/consultations")).json();
    expect(after.meta.page.total).toBe(1); // only the legitimate booking exists
    expect(after.data[0].status).toBe("scheduled"); // and the cross-site cancel did nothing
  });

  test("a write from the app's own origin is accepted", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const res = await api.post("/api/consultations", {
      headers: { origin: new URL(baseURL!).origin, "sec-fetch-site": "same-origin" },
      data: JSON.parse(body),
    });
    expect(res.status()).toBe(201);
  });

  test("an authenticated JSON request with a charset parameter is still accepted", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const res = await api.post("/api/consultations", {
      headers: { "content-type": "application/json; charset=utf-8" },
      data: body,
    });
    expect(res.status()).toBe(201);
  });
});
