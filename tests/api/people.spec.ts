import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { anonymousApi, apiActor } from "../support/api";
import { createTutor, uniqueSlot } from "../support/supabase";

// The admin's People screen and the notifications it can cause (ADR 0007, A4, A5, A8, A10, A18, A21).

test.describe("authentication and authorisation", () => {
  for (const [method, path] of [
    ["GET", "/api/admin/people"],
    ["PATCH", `/api/admin/people/${randomUUID()}`],
    ["GET", "/api/notifications"],
    ["PATCH", `/api/notifications/${randomUUID()}`],
  ] as const) {
    test(`${method} ${path.replace(/[0-9a-f-]{36}/, ":id")} rejects anonymous callers with 401`, async ({ baseURL }) => {
      const res = await (await anonymousApi(baseURL!)).fetch(path, { method, data: method === "GET" ? undefined : {} });
      expect(res.status()).toBe(401);
    });
  }

  for (const role of ["student", "tutor"] as const) {
    test(`a ${role} cannot list people or change anyone's role: 403`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!, role);
      const target = await apiActor(baseURL!);
      expect((await api.get("/api/admin/people")).status()).toBe(403);
      const res = await api.patch(`/api/admin/people/${target.user.id}`, { data: { tutor: true } });
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
      // And the target is unchanged.
      const admin = await apiActor(baseURL!, "admin");
      const list = await (await admin.api.get(`/api/admin/people?filter[q]=${encodeURIComponent(target.user.email)}`)).json();
      expect(list.data[0].role).toBe("student");
    });
  }
});

test.describe("GET /api/admin/people", () => {
});

test.describe("PATCH /api/admin/people/:id", () => {

  test("with upcoming consultations the admin must choose: 409, nothing changed", async ({ baseURL }) => {
    const admin = await apiActor(baseURL!, "admin");
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: uniqueSlot() } });

    const res = await admin.api.patch(`/api/admin/people/${tutor.id}`, { data: { tutor: false } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
    const still = (await (await admin.api.get(`/api/admin/people?filter[q]=${encodeURIComponent(tutor.email)}`)).json()).data[0];
    expect(still).toMatchObject({ role: "tutor", upcoming: 1 });
  });

  for (const [label, path, data] of [
    ["a malformed id", "/api/admin/people/nope", { tutor: true }],
    ["a missing flag", `/api/admin/people/${randomUUID()}`, {}],
    ["a non-boolean flag", `/api/admin/people/${randomUUID()}`, { tutor: "yes" }],
    ["a role smuggled in", `/api/admin/people/${randomUUID()}`, { role: "admin" }],
  ] as const) {
    test(`${label} is a 400`, async ({ baseURL }) => {
      const admin = await apiActor(baseURL!, "admin");
      expect((await admin.api.patch(path, { data })).status()).toBe(400);
    });
  }
});

test.describe("PATCH /api/notifications/:id: validation", () => {
  for (const [label, data] of [["read false", { read: false }], ["an empty body", {}], ["another field", { read: true, user_id: randomUUID() }]] as const) {
    test(`${label}`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!);
      const res = await api.patch(`/api/notifications/${randomUUID()}`, { data });
      // `read: true` plus an extra key is stripped and then not found; the other two are invalid.
      expect(res.status()).toBe("user_id" in data ? 404 : 400);
    });
  }
});
