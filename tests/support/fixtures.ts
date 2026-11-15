import type { ApiConsultation, Tutor } from "@/lib/schemas/consultation";
import type { Notification } from "@/lib/schemas/notifications";
import type { Person } from "@/lib/schemas/people";

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

/** A consultation as the API returns it. */
export function makeConsultation(over: Partial<ApiConsultation> = {}): ApiConsultation {
  const n = counter + 1;
  return {
    id: nextId(),
    student_id: "student-1",
    student_name: "Sam Taylor",
    tutor_id: "tutor-1",
    tutor_name: "Maya Chen",
    reason: `Reason ${n}`,
    scheduled_at: "2030-02-01T00:00:00+00:00",
    status: "scheduled",
    completed: false,
    created_at: "2029-12-01T00:00:00+00:00",
    updated_at: "2029-12-01T00:00:00+00:00",
    can_edit: true,
    can_complete: true,
    ...over,
  };
}

export const makeTutor = (over: Partial<Tutor> = {}): Tutor => ({ id: nextId(), display_name: "Maya Chen", ...over });

export const makePerson = (over: Partial<Person> = {}): Person => ({
  id: nextId(),
  first_name: "Sam",
  last_name: "Taylor",
  display_name: "Sam Taylor",
  email: "sam@example.com",
  role: "student",
  upcoming: 0,
  ...over,
});

export const makeNotification = (over: Partial<Notification> = {}): Notification => ({
  id: nextId(),
  kind: "consultation_cancelled",
  tutor_name: "Maya Chen",
  consultation_at: "2026-11-26T23:00:00+00:00", // 10:00 AEDT on Fri 27 Nov 2026
  created_at: "2026-11-20T00:00:00+00:00",
  read_at: null,
  ...over,
});

/** A list response in the shared envelope (ADR 0007, A23). */
export function listBody<T>(data: T[], over: Partial<{ number: number; size: number; total: number }> = {}) {
  const size = over.size ?? 10;
  const total = over.total ?? data.length;
  return {
    data,
    meta: { page: { number: over.number ?? 1, size, total, total_pages: Math.max(1, Math.ceil(total / size)) } },
  };
}

export const errorBody = (code: string, message: string, fields?: Record<string, string[]>) => ({
  error: { code, message, ...(fields ? { details: { fields } } : {}) },
});
