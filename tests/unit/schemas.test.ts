import { describe, expect, it } from "vitest";
import {
  createConsultationSchema,
  busyQuerySchema,
  idSchema,
  updateConsultationSchema,
} from "@/lib/schemas/consultation";

import { parseListQuery, type ListSpec } from "@/lib/api/list-query";

const TUTOR = "3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f";
const FILTER_SPEC: ListSpec = {
  sorts: { id: "id" },
  defaultSort: "id",
  filters: { tutor_id: { column: "tutor_id", kind: { kind: "uuid" }, ops: ["eq"] } },
};

const valid = () => ({
  tutor_id: TUTOR,
  reason: "Exam prep",
  scheduled_at: "2030-05-01T10:00:00+10:00",
});

describe("createConsultationSchema (AC-4, AC-17)", () => {
  it("accepts a valid booking and trims whitespace", () => {
    const r = createConsultationSchema.safeParse({ ...valid(), reason: "  Exam prep  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe("Exam prep");
  });

  it.each([undefined, null, "", "   "])("treats a missing or blank reason (%j) as no reason (A16)", (reason) => {
    const r = createConsultationSchema.safeParse({ ...valid(), reason });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBeNull();
  });

  it.each([undefined, "", "not-a-uuid", 42, null])("requires the tutor to be a uuid (%s)", (tutor) => {
    expect(createConsultationSchema.safeParse({ ...valid(), tutor_id: tutor }).success).toBe(false);
  });

  it("requires a slot: the half hour, nothing finer", () => {
    expect(createConsultationSchema.safeParse({ ...valid(), scheduled_at: "2030-05-01T00:30:00Z" }).success).toBe(true);
    expect(createConsultationSchema.safeParse({ ...valid(), scheduled_at: "2030-05-01T00:15:00Z" }).success).toBe(false);
    expect(createConsultationSchema.safeParse({ ...valid(), scheduled_at: "2030-05-01T00:00:30Z" }).success).toBe(false);
  });

  it("rejects over-long values", () => {
    expect(createConsultationSchema.safeParse({ ...valid(), reason: "x".repeat(1001) }).success).toBe(false);
  });

  it("requires an explicit UTC offset on scheduled_at (conventions C1)", () => {
    expect(createConsultationSchema.safeParse({ ...valid(), scheduled_at: "2030-05-01T10:00:00" }).success).toBe(false);
    expect(createConsultationSchema.safeParse({ ...valid(), scheduled_at: "2030-05-01T10:00:00Z" }).success).toBe(true);
    expect(createConsultationSchema.safeParse({ ...valid(), scheduled_at: "not a date" }).success).toBe(false);
  });

  it("strips unknown keys so student_id cannot be smuggled in (AC-9)", () => {
    const r = createConsultationSchema.safeParse({ ...valid(), student_id: "someone-else", status: "cancelled" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("student_id");
      expect(r.data).not.toHaveProperty("status");
    }
  });
});

describe("createConsultationSchema: values Postgres cannot store (AC-17)", () => {
  it("rejects a NUL character in the reason (it would be a 500)", () => {
    expect(createConsultationSchema.safeParse({ ...valid(), reason: "a\u0000b" }).success).toBe(false);
  });
});

describe("updateConsultationSchema (AC-3, AC-5, AC-6, AC-17)", () => {
  it("requires a rescheduled time to be on a slot too", () => {
    expect(updateConsultationSchema.safeParse({ action: "reschedule", scheduled_at: "2030-06-01T10:15:00Z" }).success).toBe(false);
  });

  it("accepts each action with its payload", () => {
    expect(updateConsultationSchema.safeParse({ action: "reschedule", scheduled_at: "2030-06-01T10:00:00Z" }).success).toBe(true);
    expect(updateConsultationSchema.safeParse({ action: "set_completed", completed: true }).success).toBe(true);
    expect(updateConsultationSchema.safeParse({ action: "cancel" }).success).toBe(true);
  });

  it("rejects unknown actions and missing or wrong payloads", () => {
    expect(updateConsultationSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(updateConsultationSchema.safeParse({ action: "set_completed" }).success).toBe(false);
    expect(updateConsultationSchema.safeParse({ action: "set_completed", completed: "yes" }).success).toBe(false);
    expect(updateConsultationSchema.safeParse({ action: "reschedule" }).success).toBe(false);
    expect(updateConsultationSchema.safeParse({}).success).toBe(false);
  });
});

describe("ids that Postgres accepts (the seed data uses ones with version digit 0)", () => {
  const SEEDED = "5eed0000-0000-0000-0000-0000000000a2";

  it("are accepted as an id and as a tutor", () => {
    expect(idSchema.safeParse(SEEDED).success).toBe(true);
    expect(createConsultationSchema.safeParse({ ...valid(), tutor_id: SEEDED }).success).toBe(true);
  });

  it("are accepted in the busy-times window's tutor path and in uuid filters", () => {
    expect(parseListQuery(FILTER_SPEC, new URLSearchParams(`filter[tutor_id]=${SEEDED}`)).filters).toHaveLength(1);
  });
});

describe("idSchema (AC-17)", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(idSchema.safeParse("3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f").success).toBe(true);
    expect(idSchema.safeParse("nope").success).toBe(false);
    expect(idSchema.safeParse("1; drop table consultations").success).toBe(false);
  });
});

describe("busyQuerySchema: the window a tutor's busy times are asked for", () => {
  const at = (iso: string) => ({ from: "2030-01-01T00:00:00Z", to: iso });

  it("accepts a window of up to 35 days", () => {
    expect(busyQuerySchema.safeParse(at("2030-01-02T00:00:00Z")).success).toBe(true);
    expect(busyQuerySchema.safeParse(at("2030-02-05T00:00:00Z")).success).toBe(true); // exactly 35 days
  });

  it("rejects a window wider than 35 days, an empty one, and one that runs backwards", () => {
    expect(busyQuerySchema.safeParse(at("2030-02-05T00:00:01Z")).success).toBe(false);
    expect(busyQuerySchema.safeParse(at("2030-01-01T00:00:00Z")).success).toBe(false);
    expect(busyQuerySchema.safeParse(at("2029-12-31T00:00:00Z")).success).toBe(false);
  });
});
