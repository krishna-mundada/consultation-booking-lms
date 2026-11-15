import { describe, expect, it } from "vitest";
import { ConflictError } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import {
  assertChangeable,
  canChange,
  canComplete,
  consultationTone,
  toneState,
  hasStarted,
  toApiConsultation,
} from "@/lib/domain/consultation-rules";
import type { ConsultationRow } from "@/lib/schemas/consultation";

const NOW = new Date("2030-01-01T00:00:00Z");

const row = (over: Partial<ConsultationRow> = {}): ConsultationRow => ({
  id: "3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f",
  student_id: "student-1",
  tutor_id: "tutor-1",
  student_name: "Ada Lovelace",
  tutor_name: "Maya Chen",
  reason: "Exam prep",
  scheduled_at: "2030-02-01T10:00:00+00:00",
  status: "scheduled",
  completed: false,
  created_at: "2029-12-01T00:00:00+00:00",
  updated_at: "2029-12-01T00:00:00+00:00",
  ...over,
});

const PAST = "2029-12-31T23:30:00+00:00";

describe("hasStarted (A17)", () => {
  it("is false for a later start, true at and after the start, compared as instants", () => {
    expect(hasStarted(row(), NOW)).toBe(false);
    expect(hasStarted(row({ scheduled_at: "2030-01-01T00:00:00Z" }), NOW)).toBe(true);
    expect(hasStarted(row({ scheduled_at: PAST }), NOW)).toBe(true);
    // 10:00+11:00 on 1 Jan is 23:00Z on 31 Dec: already started.
    expect(hasStarted(row({ scheduled_at: "2030-01-01T10:00:00+11:00" }), NOW)).toBe(true);
  });
});

describe("canChange / canComplete", () => {
  it("lets a scheduled, not-yet-started consultation be moved or cancelled", () => {
    expect(canChange(row(), NOW)).toBe(true);
  });

  it("does not let a started or a cancelled one be moved or cancelled", () => {
    expect(canChange(row({ scheduled_at: PAST }), NOW)).toBe(false);
    expect(canChange(row({ status: "cancelled" }), NOW)).toBe(false);
  });

  it("lets Completed be ticked only once the consultation has started: it means it happened", () => {
    expect(canComplete(row(), NOW)).toBe(false); // still to come
    expect(canComplete(row({ scheduled_at: PAST }), NOW)).toBe(true);
    expect(canComplete(row({ scheduled_at: "2030-01-01T00:00:00Z" }), NOW)).toBe(true); // starts right now
  });

  it("never lets a cancelled one be ticked", () => {
    expect(canComplete(row({ status: "cancelled", scheduled_at: PAST }), NOW)).toBe(false);
  });

  it("lets a ticked one be unticked, wherever it is", () => {
    expect(canComplete(row({ completed: true }), NOW)).toBe(true);
  });
});

describe("assertChangeable (AC-28, A17)", () => {
  it("allows moving or cancelling a scheduled, upcoming consultation, and unticking it", () => {
    expect(() => assertChangeable(row(), NOW, "move_or_cancel")).not.toThrow();
    expect(() => assertChangeable(row(), NOW, "uncomplete")).not.toThrow();
  });

  it("refuses to mark one complete before it has started, with a conflict that says why", () => {
    expect(() => assertChangeable(row(), NOW, "complete")).toThrow(ConflictError);
    expect(() => assertChangeable(row(), NOW, "complete")).toThrow(MESSAGES.notStartedYet);
  });

  it("refuses everything on a cancelled consultation with a conflict", () => {
    expect(() => assertChangeable(row({ status: "cancelled" }), NOW, "move_or_cancel")).toThrow(ConflictError);
    expect(() => assertChangeable(row({ status: "cancelled" }), NOW, "complete")).toThrow(ConflictError);
    expect(() => assertChangeable(row({ status: "cancelled" }), NOW, "uncomplete")).toThrow(ConflictError);
  });

  it("refuses moving or cancelling one that has started, but allows the Completed tick", () => {
    expect(() => assertChangeable(row({ scheduled_at: PAST }), NOW, "move_or_cancel")).toThrow(ConflictError);
    expect(() => assertChangeable(row({ scheduled_at: PAST }), NOW, "complete")).not.toThrow();
  });
});

describe("consultationTone: how a consultation looks (one place decides, so the cards and tables agree)", () => {
  // NOW is 11:00 Melbourne time on Tue 1 Jan 2030 (2029-12-31T... in UTC is 2030-01-01T00:00Z = 11:00 AEDT).
  it("is cancelled for a cancelled one, whenever it was", () => {
    expect(consultationTone(row({ status: "cancelled" }), NOW)).toBe("cancelled");
    expect(consultationTone(row({ status: "cancelled", scheduled_at: PAST }), NOW)).toBe("cancelled");
  });

  it("is complete for one that was marked complete", () => {
    expect(consultationTone(row({ completed: true, scheduled_at: PAST }), NOW)).toBe("complete");
  });

  it("is awaiting for one that has started but was not marked complete", () => {
    expect(consultationTone(row({ scheduled_at: PAST }), NOW)).toBe("awaiting");
    expect(consultationTone(row({ scheduled_at: "2030-01-01T00:00:00Z" }), NOW)).toBe("awaiting"); // starts right now
  });

  it("is today for one still to come later today in Melbourne", () => {
    expect(consultationTone(row({ scheduled_at: "2030-01-01T05:00:00Z" }), NOW)).toBe("today"); // 16:00 the same day
  });

  it("is upcoming for one on a later Melbourne day, even if it is under 24 hours away", () => {
    expect(consultationTone(row({ scheduled_at: "2030-01-01T22:00:00Z" }), NOW)).toBe("upcoming"); // 9:00 the next day
    expect(consultationTone(row({ scheduled_at: "2030-02-01T10:00:00Z" }), NOW)).toBe("upcoming");
  });

  it("is judged by Melbourne's calendar, not UTC's", () => {
    // 13:30Z on 1 Jan is 00:30 on 2 Jan in Melbourne: tomorrow, although the UTC date is the same.
    expect(consultationTone(row({ scheduled_at: "2030-01-01T13:30:00Z" }), NOW)).toBe("upcoming");
  });
});

describe("toneState: the badge, the Status filter and the sort all use the four states", () => {
  it("maps every tone to one of them, today and upcoming both being scheduled", () => {
    expect(toneState("today")).toBe("scheduled");
    expect(toneState("upcoming")).toBe("scheduled");
    expect(toneState("awaiting")).toBe("awaiting");
    expect(toneState("complete")).toBe("complete");
    expect(toneState("cancelled")).toBe("cancelled");
  });
});

describe("hasStarted decides the groups: Upcoming is what has not started, Earlier is what has", () => {
  it("is by time alone, not by status or the tick", () => {
    expect(hasStarted(row({ completed: true }), NOW)).toBe(false); // ticked early (legacy), but still to come
    expect(hasStarted(row({ status: "cancelled", scheduled_at: PAST }), NOW)).toBe(true);
  });
});

describe("toApiConsultation (the read-path twin of the write guards)", () => {
  const student = { id: "student-1", role: "student" } as const;

  it("does not offer Completed for one that is still to come", () => {
    const api = toApiConsultation(row(), student, NOW);
    expect(api.can_edit).toBe(true);
    expect(api.can_complete).toBe(false);
  });

  it("keeps Completed available but not editing once the consultation has started", () => {
    const api = toApiConsultation(row({ scheduled_at: PAST }), student, NOW);
    expect(api.can_edit).toBe(false);
    expect(api.can_complete).toBe(true);
  });

  it("flags nothing on a cancelled row", () => {
    const api = toApiConsultation(row({ status: "cancelled" }), student, NOW);
    expect(api.can_edit).toBe(false);
    expect(api.can_complete).toBe(false);
  });

  it.each([
    ["another student", { id: "student-2", role: "student" as const }],
    ["the tutor", { id: "tutor-1", role: "tutor" as const }],
    ["an admin", { id: "admin-1", role: "admin" as const }],
    ["a viewer with no role", { id: "student-1", role: null }],
  ])("never marks a row actionable for %s (AC-12, A9)", (_who, viewer) => {
    const api = toApiConsultation(row(), viewer, NOW);
    expect(api.can_edit).toBe(false);
    expect(api.can_complete).toBe(false);
  });

  it("turns a missing name into an empty string and keeps a null reason", () => {
    const api = toApiConsultation({ ...row(), tutor_name: null, reason: null }, student, NOW);
    expect(api.tutor_name).toBe("");
    expect(api.reason).toBeNull();
  });

  it("fails loudly on a status the app does not know", () => {
    expect(() => toApiConsultation(row({ status: "weird" as never }), student, NOW)).toThrow();
  });
});
