import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { NOTIFICATION_LIST } from "@/lib/services/notifications";
import { PEOPLE_LIST } from "@/lib/services/people";
import { TUTOR_PICKER_LIST } from "@/lib/services/tutors";
import { STUDENT_LIST } from "@/lib/services/consultations";
import { createServices } from "@/lib/services";
import { businessSlot, createTestUser, listQuery, uniqueSlot, type TestUser } from "../support/supabase";

// People, promotion/demotion, notifications and the tutor picker, against the real database.

const svc = (u: TestUser) => createServices(u.db, u.id);

let admin: TestUser;
let adminSvc: ReturnType<typeof svc>;

beforeAll(async () => {
  admin = await createTestUser("admin");
  adminSvc = svc(admin);
});

describe("people list (ADR 0007, A4, A21)", () => {
  it("finds a person by name or by email, with their role and upcoming count", async () => {
    const student = await createTestUser("student");
    const byEmail = await adminSvc.people.list(listQuery(PEOPLE_LIST, `filter[q]=${student.email}`));
    expect(byEmail.data).toHaveLength(1);
    expect(byEmail.data[0]).toMatchObject({ id: student.id, email: student.email, role: "student", upcoming: 0 });

    // display_name falls back to the email's local part, so a name search finds the same person.
    const local = student.email.split("@")[0];
    const byName = await adminSvc.people.list(listQuery(PEOPLE_LIST, `filter[q]=${local}`));
    expect(byName.data.map((p) => p.id)).toContain(student.id);
  });

  it("filters by role, sorts, pages, and counts a tutor's upcoming consultations", async () => {
    const tutor = await createTestUser("tutor");
    const student = await createTestUser("student");
    await svc(student).consultations.create({ tutor_id: tutor.id, reason: null, scheduled_at: uniqueSlot() });

    const tutors = await adminSvc.people.list(listQuery(PEOPLE_LIST, `filter[role][eq]=tutor&filter[q]=${tutor.email}`));
    expect(tutors.data).toHaveLength(1);
    expect(tutors.data[0].upcoming).toBe(1);

    const many = await adminSvc.people.list(listQuery(PEOPLE_LIST, "filter[role][in]=student,tutor&sort=-email&page[size]=3"));
    expect(many.data).toHaveLength(3);
    expect(many.data.every((p) => p.role !== "admin")).toBe(true);
    const emails = many.data.map((p) => p.email);
    expect(emails).toEqual([...emails].sort().reverse());
    expect(many.meta.page.total).toBeGreaterThan(3);

    const beyond = await adminSvc.people.list(listQuery(PEOPLE_LIST, "page[size]=5&page[number]=1000"));
    expect(beyond.data).toEqual([]);
    expect(beyond.meta.page.total).toBeGreaterThan(0);
  });

  it("treats search text literally in the database function: a % or _ does not match everything", async () => {
    // The list parser strips these characters, so go straight at the function behind the endpoint.
    for (const q of ["%", "_", "\\"]) {
      const { data, error } = await admin.db.rpc("admin_list_people", {
        p_q: q, p_roles: [], p_sort: "name", p_desc: false, p_limit: 5, p_offset: 0,
      });
      expect(error, q).toBeNull();
      expect(data, q).toEqual([]);
    }
  });

  it("is for admins only", async () => {
    for (const role of ["student", "tutor"] as const) {
      const user = await createTestUser(role);
      await expect(svc(user).people.list(listQuery(PEOPLE_LIST))).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe("promote and demote (A4, A5, A8)", () => {
  it("promotes a student to tutor, who then appears in the picker", async () => {
    const student = await createTestUser("student");
    const result = await adminSvc.people.setTutor(student.id, { tutor: true });
    expect(result).toEqual({ role: "tutor", upcoming: 0, cancelled: 0 });

    const picker = await svc(await createTestUser("student")).tutors.list(listQuery(TUTOR_PICKER_LIST, `filter[q]=${student.email.split("@")[0]}`));
    expect(picker.data.map((t) => t.id)).toEqual([student.id]);
  });

  it("demotes a tutor with nothing coming up straight away, and they leave the picker", async () => {
    const tutor = await createTestUser("tutor");
    const result = await adminSvc.people.setTutor(tutor.id, { tutor: false });
    expect(result.role).toBe("student");
    const picker = await svc(await createTestUser("student")).tutors.list(listQuery(TUTOR_PICKER_LIST, `filter[q]=${tutor.email.split("@")[0]}`));
    expect(picker.data).toEqual([]);
  });

  it("makes the admin choose when the tutor has upcoming consultations (409, nothing changed)", async () => {
    const tutor = await createTestUser("tutor");
    const student = await createTestUser("student");
    await svc(student).consultations.create({ tutor_id: tutor.id, reason: null, scheduled_at: uniqueSlot() });
    await expect(adminSvc.people.setTutor(tutor.id, { tutor: false })).rejects.toBeInstanceOf(ConflictError);
    const still = await adminSvc.people.list(listQuery(PEOPLE_LIST, `filter[q]=${tutor.email}`));
    expect(still.data[0].role).toBe("tutor");
  });

  it("cancels the upcoming consultations and notifies each student when told to", async () => {
    const tutor = await createTestUser("tutor");
    const [s1, s2] = await Promise.all([createTestUser("student"), createTestUser("student")]);
    const slot1 = businessSlot(2, 4);
    const slot2 = businessSlot(3, 4);
    await svc(s1).consultations.create({ tutor_id: tutor.id, reason: "long free text that must not be repeated", scheduled_at: slot1 });
    await svc(s2).consultations.create({ tutor_id: tutor.id, reason: null, scheduled_at: slot2 });

    const result = await adminSvc.people.setTutor(tutor.id, { tutor: false, cancel_upcoming: true });
    expect(result).toEqual({ role: "student", upcoming: 2, cancelled: 2 });

    const mine = await svc(s1).consultations.listOwn(listQuery(STUDENT_LIST));
    expect(mine.data.map((c) => c.status)).toEqual(["cancelled"]);

    const inbox = await svc(s1).notifications.list(listQuery(NOTIFICATION_LIST));
    expect(inbox.data).toHaveLength(1);
    expect(inbox.data[0]).toMatchObject({ kind: "consultation_cancelled", read_at: null });
    expect(inbox.data[0].tutor_name).toBe(tutor.email.split("@")[0]);
    expect(new Date(inbox.data[0].consultation_at).toISOString()).toBe(slot1);
    // The notification never carries the reason (A18).
    expect(JSON.stringify(inbox.data[0])).not.toContain("long free text");
    expect((await svc(s2).notifications.list(listQuery(NOTIFICATION_LIST))).data).toHaveLength(1);
  });

  it("keeps the consultations when told to keep, and the tutor still sees them", async () => {
    const tutor = await createTestUser("tutor");
    const student = await createTestUser("student");
    await svc(student).consultations.create({ tutor_id: tutor.id, reason: null, scheduled_at: uniqueSlot() });
    const result = await adminSvc.people.setTutor(tutor.id, { tutor: false, cancel_upcoming: false });
    expect(result).toMatchObject({ role: "student", upcoming: 1, cancelled: 0 });
    expect((await svc(student).notifications.list(listQuery(NOTIFICATION_LIST))).data).toEqual([]);
  });

  it("never changes an admin, and answers not-found for an unknown person", async () => {
    const other = await createTestUser("admin");
    await expect(adminSvc.people.setTutor(other.id, { tutor: true })).rejects.toThrow();
    const after = await adminSvc.people.list(listQuery(PEOPLE_LIST, `filter[q]=${other.email}`));
    expect(after.data[0].role).toBe("admin");
    await expect(adminSvc.people.setTutor(randomUUID(), { tutor: true })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is for admins only", async () => {
    const student = await createTestUser("student");
    const target = await createTestUser("student");
    await expect(svc(student).people.setTutor(target.id, { tutor: true })).rejects.toBeInstanceOf(ForbiddenError);
    const tutor = await createTestUser("tutor");
    await expect(svc(tutor).people.setTutor(target.id, { tutor: true })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("notifications (A10)", () => {
  async function studentWithNotification() {
    const tutor = await createTestUser("tutor");
    const student = await createTestUser("student");
    await svc(student).consultations.create({ tutor_id: tutor.id, reason: null, scheduled_at: uniqueSlot() });
    await adminSvc.people.setTutor(tutor.id, { tutor: false, cancel_upcoming: true });
    const [n] = (await svc(student).notifications.list(listQuery(NOTIFICATION_LIST))).data;
    return { student, n };
  }

  it("is dismissed by its owner, stays listed as read, and dismissing twice is fine", async () => {
    const { student, n } = await studentWithNotification();
    const s = svc(student);
    const first = await s.notifications.markRead(n.id);
    expect(first.read_at).not.toBeNull();
    expect((await s.notifications.markRead(n.id)).read_at).toBe(first.read_at);

    expect((await s.notifications.list(listQuery(NOTIFICATION_LIST, "filter[read]=false"))).data).toEqual([]);
    expect((await s.notifications.list(listQuery(NOTIFICATION_LIST, "filter[read]=true"))).data).toHaveLength(1);
  });

  it("is not visible to, or dismissable by, anyone else", async () => {
    const { n } = await studentWithNotification();
    const other = svc(await createTestUser("student"));
    await expect(other.notifications.markRead(n.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await other.notifications.list(listQuery(NOTIFICATION_LIST))).data).toEqual([]);
  });
});

describe("tutor picker and busy times", () => {
  it("lists tutors by name with a search, and nobody else", async () => {
    const tutor = await createTestUser("tutor");
    const student = await createTestUser("student");
    const viewer = svc(await createTestUser("student"));
    const find = (who: TestUser) =>
      viewer.tutors.list(listQuery(TUTOR_PICKER_LIST, `filter[q]=${who.email.split("@")[0]}`));
    const found = await find(tutor);
    expect(found.data.map((t) => t.id)).toEqual([tutor.id]);
    expect((await find(student)).data).toEqual([]);
    expect((await find(admin)).data).toEqual([]);
    // Only the id and the name: no email, no role.
    expect(Object.keys(found.data[0]).sort()).toEqual(["display_name", "id"]);
  });

  it("reports only when a tutor is taken, to any signed-in user, and nothing about the booking", async () => {
    const tutor = await createTestUser("tutor");
    const [booker, viewer] = await Promise.all([createTestUser("student"), createTestUser("student")]);
    const slot = uniqueSlot();
    await svc(booker).consultations.create({ tutor_id: tutor.id, reason: "private", scheduled_at: slot });
    const from = new Date(Date.parse(slot) - 3_600_000).toISOString();
    const to = new Date(Date.parse(slot) + 3_600_000).toISOString();
    const busy = await svc(viewer).tutors.busyTimes(tutor.id, from, to);
    expect(busy.map((b) => new Date(b).toISOString())).toEqual([slot]);
  });

  it("stops listing a slot once it is cancelled", async () => {
    const tutor = await createTestUser("tutor");
    const booker = await createTestUser("student");
    const slot = uniqueSlot();
    const c = await svc(booker).consultations.create({ tutor_id: tutor.id, reason: null, scheduled_at: slot });
    await svc(booker).consultations.cancel(c.id);
    const window = [new Date(Date.parse(slot) - 3_600_000).toISOString(), new Date(Date.parse(slot) + 3_600_000).toISOString()] as const;
    expect(await svc(booker).tutors.busyTimes(tutor.id, ...window)).toEqual([]);
  });
});
