import { z, type ZodType } from "zod";
import { CONTENT_TYPE_JSON } from "@/lib/api/http";
import { ERROR_CODE, type ErrorCode, type FieldErrors } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import { API_ROUTES } from "@/lib/routes";
import { errorEnvelopeSchema, itemSchema, pageSchema } from "@/lib/schemas/api";
import {
  apiConsultationSchema,
  tutorSchema,
  type CreateConsultationInput,
  type UpdateConsultationInput,
} from "@/lib/schemas/consultation";
import { notificationSchema } from "@/lib/schemas/notifications";
import { personSchema, setTutorResultSchema, type SetTutorInput } from "@/lib/schemas/people";

// The browser's typed view of the HTTP API (docs/architecture.md section 6). Responses are
// validated against the same schemas the types come from, so what the rest of the app receives
// really has the shape its types claim. Every failure becomes an ApiError carrying the server's
// code, message and per-field details.

/** The codes the server sends, plus NETWORK for "no response at all". */
type ClientErrorCode = ErrorCode | "NETWORK";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly fields: FieldErrors = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": CONTENT_TYPE_JSON, ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK", MESSAGES.networkError);
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const envelope = errorEnvelopeSchema.safeParse(body);
    if (envelope.success) {
      const { code, message, details } = envelope.data.error;
      throw new ApiError(res.status, code, message, details?.fields);
    }
    throw new ApiError(res.status, ERROR_CODE.internal, MESSAGES.generic);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(res.status, ERROR_CODE.internal, MESSAGES.generic);
  return parsed.data;
}

/** A list's query string, built with toApiQuery (lib/list-state.ts). */
const withQuery = (path: string, query: string) => `${path}?${query}`;

const pageOfConsultations = pageSchema(apiConsultationSchema);
const oneConsultation = itemSchema(apiConsultationSchema);

export const consultationsApi = {
  /** The student's own. */
  list: (query: string) => call(withQuery(API_ROUTES.consultations, query), pageOfConsultations),
  /** The consultations booked with the caller as the tutor. */
  sessions: (query: string) => call(withQuery(API_ROUTES.tutorSessions, query), pageOfConsultations),
  /** Everyone's, for an admin. */
  listAll: (query: string) => call(withQuery(API_ROUTES.adminConsultations, query), pageOfConsultations),

  create: (input: CreateConsultationInput) =>
    call(API_ROUTES.consultations, oneConsultation, { method: "POST", body: JSON.stringify(input) }),

  update: (id: string, input: UpdateConsultationInput) =>
    call(API_ROUTES.consultation(id), oneConsultation, { method: "PATCH", body: JSON.stringify(input) }),
};

/** Who can be booked, and when each of them is already taken. */
export const tutorsApi = {
  list: (query: string) => call(withQuery(API_ROUTES.tutors, query), pageSchema(tutorSchema)),

  /** The instants a tutor is busy between two instants (at most 35 days apart). */
  busy: async (tutorId: string, from: string, to: string) =>
    (
      await call(
        `${API_ROUTES.tutorBusy(tutorId)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        itemSchema(z.array(z.string())),
      )
    ).data,
};

/** The admin's People screen. */
export const peopleApi = {
  list: (query: string) => call(withQuery(API_ROUTES.adminPeople, query), pageSchema(personSchema)),

  setTutor: async (id: string, input: SetTutorInput) =>
    (
      await call(API_ROUTES.adminPerson(id), itemSchema(setTutorResultSchema), {
        method: "PATCH",
        body: JSON.stringify(input),
      })
    ).data,
};

export const notificationsApi = {
  list: (query: string) => call(withQuery(API_ROUTES.notifications, query), pageSchema(notificationSchema)),

  markRead: async (id: string) =>
    (
      await call(API_ROUTES.notification(id), itemSchema(notificationSchema), {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      })
    ).data,
};
