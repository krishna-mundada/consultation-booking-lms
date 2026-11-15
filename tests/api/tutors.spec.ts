import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { anonymousApi, apiActor } from "../support/api";
import { businessSlot, createTutor, uniqueSlot } from "../support/supabase";

// A tutor is a person with the tutor role. A student picks one and books one of their half-hour
// slots; two students can never hold the same tutor at the same time, and one student can never
// hold two consultations at the same time (ADR 0007, A12, A13).

const book = (api: import("@playwright/test").APIRequestContext, tutor: string, at: string, reason = "x") =>
  api.post("/api/consultations", { data: { tutor_id: tutor, reason, scheduled_at: at } });

test.describe("GET /api/tutors", () => {
  test("lists tutors by name and nobody else, with just an id and a name", async ({ baseURL }) => {
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const admin = await apiActor(baseURL!, "admin");
    const find = async (who: { email: string }) => {
      const res = await student.api.get(`/api/tutors?filter[q]=${encodeURIComponent(who.email.split("@")[0])}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["cache-control"]).toContain("no-store");
      return (await res.json()).data as { id: string; display_name: string }[];
    };

    const found = await find(tutor);
    expect(found.map((t) => t.id)).toEqual([tutor.id]);
    expect(Object.keys(found[0]).sort()).toEqual(["display_name", "id"]); // no email, no role
    expect(await find(student.user)).toEqual([]); // a student is not a tutor
    expect(await find(admin.user)).toEqual([]); // nor is an admin
  });

  test("is closed to anonymous callers", async ({ baseURL }) => {
    expect((await (await anonymousApi(baseURL!)).get("/api/tutors")).status()).toBe(401);
  });
});

test.describe("booking a tutor", () => {

  test("a second student cannot book the same tutor at the same time: 409, and nothing is created", async ({ baseURL }) => {
    const tutor = await createTutor();
    const first = await apiActor(baseURL!);
    const second = await apiActor(baseURL!);
    const at = uniqueSlot();

    expect((await book(first.api, tutor.id, at)).status()).toBe(201);
    const clash = await book(second.api, tutor.id, at);
    expect(clash.status()).toBe(409);
    const body = await clash.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/just taken/i);
    expect((await (await second.api.get("/api/consultations")).json()).meta.page.total).toBe(0);
  });
});

test.describe("GET /api/tutors/:id/busy", () => {
  const window = (at: string) => ({
    from: encodeURIComponent(new Date(Date.parse(at) - 3_600_000).toISOString()),
    to: encodeURIComponent(new Date(Date.parse(at) + 3_600_000).toISOString()),
  });

  test("tells another student the slot is taken, and nothing else about it", async ({ baseURL }) => {
    const tutor = await createTutor();
    const booker = await apiActor(baseURL!);
    const asker = await apiActor(baseURL!);
    const taken = uniqueSlot();
    await book(booker.api, tutor.id, taken, "private reason");

    const { from, to } = window(taken);
    const res = await asker.api.get(`/api/tutors/${tutor.id}/busy?from=${from}&to=${to}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.map((t: string) => new Date(t).toISOString())).toEqual([taken]);
    expect(JSON.stringify(body)).not.toContain("private reason");
    expect(JSON.stringify(body)).not.toContain(booker.user.id);
  });

  test("does not count a cancelled consultation, or one outside the window", async ({ baseURL }) => {
    const tutor = await createTutor();
    const { api } = await apiActor(baseURL!);
    const cancelled = uniqueSlot();
    const created = await book(api, tutor.id, cancelled);
    await api.patch(`/api/consultations/${(await created.json()).data.id}`, { data: { action: "cancel" } });
    // Booked, but on a different day from the window.
    const farAway = [businessSlot(1, 0), businessSlot(30, 0)].find((x) => Math.abs(Date.parse(x) - Date.parse(cancelled)) > 2 * 86_400_000)!;
    await book(api, tutor.id, farAway);

    const { from, to } = window(cancelled);
    const res = await api.get(`/api/tutors/${tutor.id}/busy?from=${from}&to=${to}`);
    expect((await res.json()).data).toEqual([]);
  });

  for (const [label, path] of [
    ["a malformed tutor id", "/api/tutors/nope/busy?from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z"],
    ["a missing window", `/api/tutors/${randomUUID()}/busy`],
    ["a window that is not a date", `/api/tutors/${randomUUID()}/busy?from=soon&to=later`],
    ["a window over 35 days", `/api/tutors/${randomUUID()}/busy?from=2030-01-01T00:00:00Z&to=2030-03-01T00:00:00Z`],
  ] as const) {
    test(`${label} is a 400`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!);
      expect((await api.get(path)).status()).toBe(400);
    });
  }

  test("is closed to anonymous callers", async ({ baseURL }) => {
    const res = await (await anonymousApi(baseURL!)).get(
      `/api/tutors/${randomUUID()}/busy?from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z`,
    );
    expect(res.status()).toBe(401);
  });
});
