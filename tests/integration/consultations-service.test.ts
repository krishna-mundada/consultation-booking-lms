import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { ADMIN_LIST, STUDENT_LIST, TUTOR_SESSIONS_LIST } from "@/lib/services/consultations";
import { createServices } from "@/lib/services";
import {
  adminClient,
  businessSlot,
  createTestUser,
  listQuery,
  melbourneInstant,
  uniqueSlot,
  zoneParts,
  type TestUser,
} from "../support/supabase";

// Runs against the real local database with real RLS, triggers and constraints. Every test
// creates its own tutor and takes slots from uniqueSlot(), so tests never collide.

const svc = (u: TestUser) => createServices(u.db, u.id);

let alice: TestUser;
let bob: TestUser;
let admin: TestUser;
let aliceSvc: ReturnType<typeof svc>;
let bobSvc: ReturnType<typeof svc>;
let adminSvc: ReturnType<typeof svc>;

beforeAll(async () => {
  [alice, bob, admin] = await Promise.all([
    createTestUser("student"),
    createTestUser("student"),
    createTestUser("admin"),
  ]);
  aliceSvc = svc(alice);
  bobSvc = svc(bob);
  adminSvc = svc(admin);
});

const newTutor = () => createTestUser("tutor");
const book = (s: ReturnType<typeof svc>, tutor: TestUser, over: { reason?: string | null; scheduled_at?: string } = {}) =>
  s.consultations.create({ tutor_id: tutor.id, reason: null, scheduled_at: uniqueSlot(), ...over });

describe("create (AC-4, ADR 0007 A11-A15)", () => {
  it("books a consultation owned by the caller, with the tutor's name and an optional reason", async () => {
    const tutor = await newTutor();
    const c = await book(aliceSvc, tutor, { reason: "Essay help" });
    expect(c.student_id).toBe(alice.id);
    expect(c.tutor_id).toBe(tutor.id);
    expect(c.tutor_name).not.toBe("");
    expect(c.status).toBe("scheduled");
    expect(c.completed).toBe(false);
    expect(c.can_edit).toBe(true);
    expect(c.reason).toBe("Essay help");
    expect((await book(aliceSvc, tutor)).reason).toBeNull();
  });

  it.each([
    ["in the past", "2001-01-01T10:00:00Z"],
    ["off the half-hour grid", () => new Date(Date.parse(businessSlot(3, 2)) + 60_000).toISOString()],
    ["on a weekend", () => weekendSlot()],
    ["after hours (17:00 Melbourne)", () => melbourneAfterHours()],
    ["more than 8 weeks ahead", () => businessSlot(45, 0, 56)],
  ])("rejects a time %s", async (_label, when) => {
    const tutor = await newTutor();
    const scheduled_at = typeof when === "function" ? when() : when;
    await expect(book(aliceSvc, tutor, { scheduled_at })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects booking someone who is not a tutor", async () => {
    await expect(
      aliceSvc.consultations.create({ tutor_id: bob.id, reason: null, scheduled_at: uniqueSlot() }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      aliceSvc.consultations.create({ tutor_id: randomUUID(), reason: null, scheduled_at: uniqueSlot() }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not let two students hold the same tutor slot (the race is settled by the database)", async () => {
    const tutor = await newTutor();
    const scheduled_at = uniqueSlot();
    const results = await Promise.allSettled([
      book(aliceSvc, tutor, { scheduled_at }),
      book(bobSvc, tutor, { scheduled_at }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ConflictError);
  });

  it("does not let one student hold two consultations at the same time", async () => {
    const [t1, t2] = await Promise.all([newTutor(), newTutor()]);
    const scheduled_at = uniqueSlot();
    await book(aliceSvc, t1, { scheduled_at });
    await expect(book(aliceSvc, t2, { scheduled_at })).rejects.toBeInstanceOf(ConflictError);
  });

  it("frees the slot when a consultation is cancelled", async () => {
    const tutor = await newTutor();
    const scheduled_at = uniqueSlot();
    const first = await book(aliceSvc, tutor, { scheduled_at });
    await aliceSvc.consultations.cancel(first.id);
    await expect(book(bobSvc, tutor, { scheduled_at })).resolves.toMatchObject({ student_id: bob.id });
  });

  it("refuses a tutor and an admin (they hold no write capability)", async () => {
    const tutor = await newTutor();
    await expect(book(svc(tutor), tutor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(book(adminSvc, tutor)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("listOwn (AC-2, AC-8, AC-18, A24)", () => {
  it("returns only the caller's consultations, sorted and paged", async () => {
    const carol = await createTestUser("student");
    const tutor = await newTutor();
    const s = svc(carol);
    // Booked out of order on purpose.
    await book(s, tutor, { reason: "third", scheduled_at: businessSlot(6, 0) });
    await book(s, tutor, { reason: "first", scheduled_at: businessSlot(1, 0) });
    await book(s, tutor, { reason: "second", scheduled_at: businessSlot(3, 0) });

    const page1 = await s.consultations.listOwn(listQuery(STUDENT_LIST, "page[size]=2"));
    expect(page1.meta.page).toEqual({ number: 1, size: 2, total: 3, total_pages: 2 });
    expect(page1.data.map((c) => c.reason)).toEqual(["first", "second"]);

    const page2 = await s.consultations.listOwn(listQuery(STUDENT_LIST, "page[size]=2&page[number]=2"));
    expect(page2.data.map((c) => c.reason)).toEqual(["third"]);

    const desc = await s.consultations.listOwn(listQuery(STUDENT_LIST, "sort=-scheduled_at"));
    expect(desc.data.map((c) => c.reason)).toEqual(["third", "second", "first"]);

    // Past the last page is an empty page with the true total, not an error.
    const beyond = await s.consultations.listOwn(listQuery(STUDENT_LIST, "page[size]=2&page[number]=9"));
    expect(beyond.data).toEqual([]);
    expect(beyond.meta.page.total).toBe(3);
  });

  it("searches reason and tutor name, and filters by tutor", async () => {
    const dave = await createTestUser("student");
    const [t1, t2] = await Promise.all([newTutor(), newTutor()]);
    const s = svc(dave);
    await book(s, t1, { reason: "needle-in-haystack" });
    await book(s, t2, { reason: "something else" });

    const byReason = await s.consultations.listOwn(listQuery(STUDENT_LIST, "filter[q]=needle-in-haystack"));
    expect(byReason.data.map((c) => c.reason)).toEqual(["needle-in-haystack"]);

    const byTutor = await s.consultations.listOwn(listQuery(STUDENT_LIST, `filter[tutor_id][eq]=${t2.id}`));
    expect(byTutor.data.map((c) => c.tutor_id)).toEqual([t2.id]);
  });

  it("never shows another student's rows", async () => {
    const tutor = await newTutor();
    await book(aliceSvc, tutor, { reason: "alice-private" });
    await book(bobSvc, tutor, { reason: "bob-own" });
    const bobs = await bobSvc.consultations.listOwn(listQuery(STUDENT_LIST, "page[size]=100"));
    expect(bobs.data.length).toBeGreaterThan(0);
    expect(bobs.data.every((c) => c.student_id === bob.id)).toBe(true);
    expect(bobs.data.map((c) => c.reason)).not.toContain("alice-private");
  });
});

describe("reschedule (AC-5, AC-9, A15)", () => {
  it("moves the caller's own consultation and keeps the tutor", async () => {
    const tutor = await newTutor();
    const c = await book(aliceSvc, tutor);
    const to = uniqueSlot();
    const updated = await aliceSvc.consultations.reschedule(c.id, to);
    expect(new Date(updated.scheduled_at).toISOString()).toBe(to);
    expect(updated.tutor_id).toBe(tutor.id);
  });

  it("refuses a slot the tutor already has", async () => {
    const tutor = await newTutor();
    const taken = uniqueSlot();
    await book(bobSvc, tutor, { scheduled_at: taken });
    const mine = await book(aliceSvc, tutor);
    await expect(aliceSvc.consultations.reschedule(mine.id, taken)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a time in the past", async () => {
    const c = await book(aliceSvc, await newTutor());
    await expect(aliceSvc.consultations.reschedule(c.id, "2001-01-01T10:00:00Z")).rejects.toBeInstanceOf(ValidationError);
  });

  it("answers not-found for someone else's consultation, and for an unknown id", async () => {
    const c = await book(aliceSvc, await newTutor());
    await expect(bobSvc.consultations.reschedule(c.id, uniqueSlot())).rejects.toBeInstanceOf(NotFoundError);
    await expect(aliceSvc.consultations.reschedule(randomUUID(), uniqueSlot())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("answers conflict for a cancelled consultation", async () => {
    const c = await book(aliceSvc, await newTutor());
    await aliceSvc.consultations.cancel(c.id);
    await expect(aliceSvc.consultations.reschedule(c.id, uniqueSlot())).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("setCompleted (AC-3, AC-9, AC-28)", () => {
  // Marking complete means it happened, so it needs a consultation that has started. The database refuses to
  // create those (and has its own tests for ticking one, in supabase/tests), so here: what happens before.
  it("refuses to mark a consultation complete before it has started, and says why", async () => {
    const c = await book(aliceSvc, await newTutor());
    const attempt = aliceSvc.consultations.setCompleted(c.id, true);
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toThrow("has not started yet");
    const [still] = (await aliceSvc.consultations.listOwn(listQuery(STUDENT_LIST, `filter[tutor_id]=${c.tutor_id}`))).data;
    expect(still.completed).toBe(false);
  });

  it("answers not-found for someone else's, conflict for a cancelled one", async () => {
    const c = await book(aliceSvc, await newTutor());
    await expect(bobSvc.consultations.setCompleted(c.id, true)).rejects.toBeInstanceOf(NotFoundError);
    await aliceSvc.consultations.cancel(c.id);
    await expect(aliceSvc.consultations.setCompleted(c.id, true)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("cancel (AC-6, AC-9, AC-28, AC-29)", () => {
  it("soft-cancels the caller's own consultation and keeps the record", async () => {
    const c = await book(aliceSvc, await newTutor(), { reason: "keep-me-cancel" });
    const cancelled = await aliceSvc.consultations.cancel(c.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.can_edit).toBe(false);
    const listed = await aliceSvc.consultations.listOwn(listQuery(STUDENT_LIST, "filter[q]=keep-me-cancel"));
    expect(listed.data.map((x) => x.status)).toEqual(["cancelled"]);
  });

  it("answers conflict when cancelling twice, not-found for someone else's", async () => {
    const c = await book(aliceSvc, await newTutor());
    await expect(bobSvc.consultations.cancel(c.id)).rejects.toBeInstanceOf(NotFoundError);
    await aliceSvc.consultations.cancel(c.id);
    await expect(aliceSvc.consultations.cancel(c.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("listAsTutor: sessions with me (A6, A7)", () => {
  it("shows a tutor the consultations booked with them, view only", async () => {
    const tutor = await newTutor();
    const t = svc(tutor);
    await book(aliceSvc, tutor, { reason: "with-the-tutor" });
    const page = await t.consultations.listAsTutor(listQuery(TUTOR_SESSIONS_LIST));
    expect(page.data.map((c) => c.reason)).toEqual(["with-the-tutor"]);
    expect(page.data[0].student_name).not.toBe("");
    expect(page.data[0].can_edit).toBe(false);
    expect(page.data[0].can_complete).toBe(false);
    // Filtering by student works.
    const filtered = await t.consultations.listAsTutor(listQuery(TUTOR_SESSIONS_LIST, `filter[student_id][eq]=${bob.id}`));
    expect(filtered.data).toEqual([]);
  });

  it("shows another tutor nothing of it, and a student an empty list", async () => {
    const tutor = await newTutor();
    const other = await newTutor();
    await book(aliceSvc, tutor);
    expect((await svc(other).consultations.listAsTutor(listQuery(TUTOR_SESSIONS_LIST))).data).toEqual([]);
    expect((await bobSvc.consultations.listAsTutor(listQuery(TUTOR_SESSIONS_LIST))).data).toEqual([]);
  });

  it("still shows them after the tutor is demoted and the consultations kept", async () => {
    const tutor = await newTutor();
    await book(aliceSvc, tutor, { reason: "kept-after-demotion" });
    const result = await adminSvc.people.setTutor(tutor.id, { tutor: false, cancel_upcoming: false });
    expect(result.role).toBe("student");
    const page = await svc(tutor).consultations.listAsTutor(listQuery(TUTOR_SESSIONS_LIST));
    expect(page.data.map((c) => c.reason)).toEqual(["kept-after-demotion"]);
  });
});

describe("listAll: the admin view (AC-7, AC-10, AC-12)", () => {
  it("lets an admin find every student's consultations by search, none of them editable", async () => {
    const tutor = await newTutor();
    const a = await book(aliceSvc, tutor, { reason: "alice-visible-to-admin" });
    const b = await book(bobSvc, tutor, { reason: "bob-visible-to-admin" });
    const found = await adminSvc.consultations.listAll(listQuery(ADMIN_LIST, "filter[q]=visible-to-admin&page[size]=100"));
    const ids = found.data.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(found.data.every((c) => !c.can_edit && !c.can_complete)).toBe(true);
    expect(found.data.find((c) => c.id === a.id)?.student_id).toBe(alice.id);
  });

  it("refuses a student and a tutor", async () => {
    const tutor = await newTutor();
    await expect(aliceSvc.consultations.listAll(listQuery(ADMIN_LIST))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc(tutor).consultations.listAll(listQuery(ADMIN_LIST))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("gives an admin no write path at all", async () => {
    const c = await book(aliceSvc, await newTutor());
    await expect(adminSvc.consultations.cancel(c.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminSvc.consultations.reschedule(c.id, uniqueSlot())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminSvc.consultations.setCompleted(c.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    const still = await adminClient().from("consultations").select("status").eq("id", c.id).single();
    expect(still.data?.status).toBe("scheduled");
  });
});

// ---- helpers for times that must be refused -----------------------------------------------------

/** A Saturday at 10:00 Melbourne, a few weeks out. */
function weekendSlot(): string {
  for (let d = 10; d < 24; d++) {
    const p = zoneParts(Date.now() + d * 86_400_000);
    if (p.weekday === "Sat") return melbourneInstant(p.year, p.month, p.day, 10, 0).toISOString();
  }
  throw new Error("no Saturday found");
}

/** 17:00 Melbourne on a weekday: the first minute after the last slot. */
function melbourneAfterHours(): string {
  const base = new Date(businessSlot(2, 15)); // 16:30 Melbourne
  return new Date(base.getTime() + 30 * 60_000).toISOString();
}
