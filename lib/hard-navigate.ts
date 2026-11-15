/**
 * Navigate with a full page load instead of a client-side route change.
 *
 * Use this when the session changes (log in, sign up, log out, session expired). Next's client
 * router deliberately keeps earlier screens alive in memory, form state and fetched data
 * included, so that Back is instant. After a logout that means the previous user's dashboard,
 * or a login form still holding their password, would survive. A full page load discards all of
 * it and makes the server decide what to show from the current session.
 *
 * (Next's lint rule warns against location.assign for internal pages. That advice is right for
 * ordinary navigation and wrong here, hence this single, documented place.)
 */
export function hardNavigate(path: string): void {
  window.location.assign(new URL(path, window.location.origin));
}
