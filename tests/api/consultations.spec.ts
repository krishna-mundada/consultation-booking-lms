import { expect, test, type APIRequestContext } from "@playwright/test";
import { anonymousApi, apiActor } from "../support/api";
import { adminClient, businessSlot, createTutor, uniqueSlot } from "../support/supabase";

// HTTP-level tests of the consultation route handlers against the running app and local database.
// Each test creates its own users and tutor, so they are independent and parallel-safe.

// Every test books with its own tutor, so tests running side by side never fight over a slot.
let TUTOR_ID = "";
test.beforeEach(async () => {
  TUTOR_ID = (await createTutor()).id;
});

const booking = (over: Record<string, unknown> = {}) => ({
  tutor_id: TUTOR_ID,
  reason: "Exam prep",
  scheduled_at: uniqueSlot(),
  ...over,
});

async function book(api: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await api.post("/api/consultations", { data: booking(over) });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string; student_id: string; can_edit: boolean; scheduled_at: string };
}

const patch = (api: APIRequestContext, id: string, data: object) =>
  api.patch(`/api/consultations/${id}`, { data });

test.describe("authentication (AC-13)", () => {
  for (const [method, path] of [
    ["GET", "/api/consultations"],
    ["POST", "/api/consultations"],
    ["PATCH", "/api/consultations/3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f"],
    ["GET", "/api/tutor/sessions"],
    ["GET", "/api/admin/consultations"],
  ] as const) {
    test(`${method} ${path} rejects anonymous callers with 401`, async ({ baseURL }) => {
      const api = await anonymousApi(baseURL!);
      const res = await api.fetch(path, { method, data: method === "GET" ? undefined : {} });
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    });
  }
});

test.describe("GET /api/consultations (AC-2, AC-8, AC-18)", () => {
  test("returns only the caller's rows in the list envelope and is never cached", async ({ baseURL }) => {
    const alice = await apiActor(baseURL!);
    const bob = await apiActor(baseURL!);
    const mine = await book(alice.api);
    await book(bob.api);

    const res = await alice.api.get("/api/consultations");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = await res.json();
    expect(body.meta.page).toEqual({ number: 1, size: 20, total: 1, total_pages: 1 });
    expect(body.data.map((c: { id: string }) => c.id)).toEqual([mine.id]);
    expect(body.data[0]).toMatchObject({ student_id: alice.user.id, tutor_id: TUTOR_ID, can_edit: true, can_complete: false });
  });

  test("Status sorts and filters by the state the badge shows, not the stored status", async ({ baseURL }) => {
    // The states are cancelled, complete, awaiting, scheduled. (Complete and awaiting need a started
    // consultation, which the database tests create; here, the two a new booking can be in.)
    const { api } = await apiActor(baseURL!);
    const scheduled = await book(api, { reason: "stays", scheduled_at: businessSlot(1, 0) });
    const cancelled = await book(api, { reason: "goes", scheduled_at: businessSlot(2, 0) });
    await patch(api, cancelled.id, { action: "cancel" });
    const ids = async (query: string) =>
      ((await (await api.get(`/api/consultations?${query}`)).json()).data as { id: string }[]).map((c) => c.id);

    expect(await ids("sort=status")).toEqual([cancelled.id, scheduled.id]); // cancelled sorts before scheduled
    expect(await ids("sort=-status")).toEqual([scheduled.id, cancelled.id]);
    expect(await ids("filter[status]=scheduled")).toEqual([scheduled.id]);
    expect(await ids("filter[status]=cancelled")).toEqual([cancelled.id]);
    expect(await ids("filter[status]=complete")).toEqual([]);
    expect(await ids("filter[status]=awaiting")).toEqual([]);
    expect((await api.get("/api/consultations?filter[status]=weird")).status()).toBe(400);
  });
});

test.describe("POST /api/consultations (AC-4, AC-9, AC-17, ADR 0007)", () => {
  test("creates a consultation for the caller and ignores smuggled owner/status fields", async ({ baseURL }) => {
    const alice = await apiActor(baseURL!);
    const bob = await apiActor(baseURL!);
    const res = await alice.api.post("/api/consultations", {
      data: booking({ student_id: bob.user.id, status: "cancelled", completed: true }),
    });
    expect(res.status()).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ student_id: alice.user.id, status: "scheduled", completed: false, can_edit: true, can_complete: false });
  });

  // The individual rules (grid, hours, weekdays, 8 weeks, length, optional reason) are asserted once where
  // they live: pgTAP for the database, tests/unit/schemas.test.ts for the schema, and the integration
  // suite for how each becomes an error. Here, one case of each way a 400 can arise is enough to show
  // the HTTP mapping and the error envelope.
  for (const [label, over] of [
    ["a time the schema refuses (no UTC offset)", { scheduled_at: "2030-05-01T10:00:00" }],
    ["a time the database rules refuse (in the past)", { scheduled_at: "2001-01-01T10:00:00Z" }],
  ] as const) {
    test(`rejects ${label} with 400 and field details`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!);
      const res = await api.post("/api/consultations", { data: booking(over) });
      expect(res.status()).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(error.details.fields).length).toBeGreaterThan(0);
    });
  }

  test("a booking with no reason at all is accepted and stores none", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const res = await api.post("/api/consultations", { data: { tutor_id: TUTOR_ID, scheduled_at: uniqueSlot() } });
    expect(res.status()).toBe(201);
    expect((await res.json()).data.reason).toBeNull();
  });

  test("rejects malformed JSON with 400", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const res = await api.post("/api/consultations", { headers: { "content-type": "application/json" }, data: "{not json" });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

test.describe("PATCH /api/consultations/:id (AC-3, AC-5, AC-6, AC-9, AC-28)", () => {
  test("reschedules, completes and cancels the caller's own consultation", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const c = await book(api);

    const to = uniqueSlot();
    const moved = await patch(api, c.id, { action: "reschedule", scheduled_at: to });
    expect(moved.status()).toBe(200);
    const movedBody = (await moved.json()).data;
    expect(new Date(movedBody.scheduled_at).toISOString()).toBe(to);
    expect(movedBody.tutor_id).toBe(TUTOR_ID); // rescheduling keeps the tutor

    // It has not happened yet, so it cannot be marked complete (the database has the success path's tests).
    const early = await patch(api, c.id, { action: "set_completed", completed: true });
    expect(early.status()).toBe(409);
    expect((await early.json()).error.message).toMatch(/has not started yet/);
    expect((await (await patch(api, c.id, { action: "set_completed", completed: false })).json()).data.completed).toBe(false);

    const cancelled = await patch(api, c.id, { action: "cancel" });
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).data).toMatchObject({ status: "cancelled", can_edit: false, can_complete: false });
  });

  // AC-9 / AC-12 / A9: every kind of change leaves the row exactly as it was. Another student gets 404
  // (existence is not revealed); an admin and the tutor hold no write capability and get 403.
  for (const [who, role, status, code] of [
    ["another student", "student", 404, "NOT_FOUND"],
    ["an admin", "admin", 403, "FORBIDDEN"],
    ["a tutor", "tutor", 403, "FORBIDDEN"],
  ] as const) {
    test(`${who} cannot reschedule, complete or cancel someone else's consultation`, async ({ baseURL }) => {
      const owner = await apiActor(baseURL!);
      const intruder = await apiActor(baseURL!, role);
      const c = await book(owner.api);
      const before = (await (await owner.api.get("/api/consultations")).json()).data[0];

      for (const data of [
        { action: "reschedule", scheduled_at: uniqueSlot() },
        { action: "set_completed", completed: true },
        { action: "cancel" },
      ]) {
        const res = await patch(intruder.api, c.id, data);
        expect(res.status(), JSON.stringify(data)).toBe(status);
        expect((await res.json()).error.code).toBe(code);
      }
      const after = (await (await owner.api.get("/api/consultations")).json()).data[0];
      expect(after).toEqual(before); // nothing changed, not even updated_at
    });
  }

  for (const [label, path, data, status, code] of [
    ["a malformed id", "/api/consultations/nope", { action: "cancel" }, 400, "VALIDATION_ERROR"],
    ["an unknown action", "/api/consultations/3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f", { action: "delete" }, 400, "VALIDATION_ERROR"],
    ["an unknown id", "/api/consultations/3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f", { action: "cancel" }, 404, "NOT_FOUND"],
  ] as const) {
    test(`answers ${status} ${code} for ${label}`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!);
      const res = await api.patch(path, { data });
      expect(res.status()).toBe(status);
      expect((await res.json()).error.code).toBe(code);
    });
  }
});

test("a refused new time is a 400 and the consultation does not move", async ({ baseURL }) => {
  // The rules themselves are covered in the database and integration suites; a taken slot (409) in tutors.spec.ts.
  const { api } = await apiActor(baseURL!);
  const c = await book(api);
  const res = await patch(api, c.id, { action: "reschedule", scheduled_at: "2001-01-01T10:00:00Z" });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect((await (await api.get("/api/consultations")).json()).data[0].scheduled_at).toBe(c.scheduled_at);
});

test.describe("who can book (AC-12, ADR 0007 A1, A9)", () => {
  for (const role of ["admin", "tutor"] as const) {
    test(`${role}s cannot book a consultation, and nothing is created`, async ({ baseURL }) => {
      const actor = await apiActor(baseURL!, role);
      const res = await actor.api.post("/api/consultations", { data: booking() });
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
      expect((await (await actor.api.get("/api/consultations")).json()).meta.page.total).toBe(0);
    });
  }

  test("a role change takes effect on the next request (ADR 0001)", async ({ baseURL }) => {
    const { user, api } = await apiActor(baseURL!);
    const c = await book(api);
    expect(c.can_edit).toBe(true);
    const setRole = (role: "student" | "admin") => adminClient().from("profiles").update({ role }).eq("id", user.id);

    await setRole("admin");
    const blocked = await patch(api, c.id, { action: "set_completed", completed: true });
    expect(blocked.status()).toBe(403);
    expect((await (await api.get("/api/consultations")).json()).data[0]).toMatchObject({ can_edit: false, can_complete: false });

    await setRole("student");
    expect((await patch(api, c.id, { action: "set_completed", completed: false })).status()).toBe(200);
  });
});

test.describe("GET /api/tutor/sessions: sessions with me (ADR 0007 A6)", () => {
  test("a tutor sees the consultations booked with them, view only, with the student's name", async ({ baseURL }) => {
    const tutor = await apiActor(baseURL!, "tutor");
    const student = await apiActor(baseURL!);
    const other = await apiActor(baseURL!);
    await book(student.api, { tutor_id: tutor.user.id, reason: "for the tutor" });
    await book(other.api, { reason: "someone else's tutor" });

    const res = await tutor.api.get("/api/tutor/sessions");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.map((c: { reason: string }) => c.reason)).toEqual(["for the tutor"]);
    expect(body.data[0]).toMatchObject({ student_id: student.user.id, can_edit: false, can_complete: false });
    expect(body.data[0].student_name).toBeTruthy();
  });
});

test.describe("GET /api/admin/consultations (AC-7, AC-10, AC-12)", () => {
  for (const role of ["student", "tutor"] as const) {
    test(`forbids a ${role} with 403`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!, role);
      const res = await api.get("/api/admin/consultations");
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
    });
  }
});
