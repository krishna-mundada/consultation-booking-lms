// Every URL the app navigates to or serves, in one place. Components, the proxy and the API
// client import these instead of repeating string literals, so a path changes in one file.
// (Tests deliberately keep their own literals: they assert the public URLs and should fail if
// one is changed by accident.)

export const ROUTES = {
  home: "/",
  login: "/auth/login",
  signUp: "/auth/sign-up",
  signUpSuccess: "/auth/sign-up-success",
  forgotPassword: "/auth/forgot-password",
  updatePassword: "/auth/update-password",
  authError: "/auth/error",
  dashboard: "/dashboard",
  sessions: "/sessions",
  admin: "/admin",
  adminPeople: "/admin/people",
} as const;

export const API_ROUTES = {
  consultations: "/api/consultations",
  consultation: (id: string) => `/api/consultations/${id}`,
  tutorSessions: "/api/tutor/sessions",
  adminConsultations: "/api/admin/consultations",
  adminPeople: "/api/admin/people",
  adminPerson: (id: string) => `/api/admin/people/${id}`,
  notifications: "/api/notifications",
  notification: (id: string) => `/api/notifications/${id}`,
  tutors: "/api/tutors",
  tutorBusy: (id: string) => `/api/tutors/${id}/busy`,
} as const;

/** Path prefixes the session proxy treats specially. */
export const PROXY_PUBLIC_PREFIXES = ["/api", "/auth"] as const;
