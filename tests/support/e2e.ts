import { randomUUID } from "node:crypto";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { slotParts, type TestUser } from "./supabase";

/**
 * A browser context in the "page is visible but the app has not loaded yet" state: the server's
 * HTML (including its streamed content) arrives, but the app's script bundles never do, so React
 * never hydrates and nothing is interactive.
 */
export async function newUnhydratedContext(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL });
  await context.route("**/_next/static/**/*.js", (route) => route.abort());
  return context;
}

/**
 * Opens a form page and waits until its submit button is enabled, which is when the page is
 * interactive. Typing earlier would be lost when React hydrates the inputs.
 */
export async function openWhenReady(page: Page, path: string, submitName: string) {
  await page.goto(path);
  await expect(page.getByRole("button", { name: submitName })).toBeEnabled();
}

/** Where each role lands after signing in (ADR 0007): students book, tutors see their sessions, admins see all. */
export const LANDING = /\/(dashboard|sessions|admin)/;

export async function loginViaUi(page: Page, email: string, password: string) {
  await openWhenReady(page, "/auth/login", "Login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(LANDING);
  // /dashboard answers with a redirect for tutors and admins, so the URL alone can match too early. Each
  // landing screen has a heading, and only the final page does.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export const loginAs = (page: Page, user: TestUser) => loginViaUi(page, user.email, user.password);

export async function signUpViaUi(page: Page, names = { first: "Ada", last: "Lovelace" }) {
  const email = `e2e-${randomUUID()}@test.local`;
  const password = `pw-${randomUUID()}`;
  await openWhenReady(page, "/auth/sign-up", "Sign up");
  await page.getByLabel("First name").fill(names.first);
  await page.getByLabel("Last name").fill(names.last);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Repeat Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return { email, password };
}

/** What a tutor is called until they have a name of their own: the part of their email before the @. */
export const nameOf = (user: { email: string }) => user.email.split("@")[0];

/** The time the app shows for a slot, such as "Tue 1 Dec 2026, 10:30 am AEDT". */
export function shownTime(slot: string): string {
  return slotParts(slot).shown;
}

/**
 * Picks a tutor by searching for their name, then one of that tutor's slots, the way a student does.
 * The search matters: the shared test database holds hundreds of tutors.
 */
export async function chooseSlot(page: Page, tutor: { email: string }, slot: string) {
  await pickTutor(page, tutor);
  await pickTime(page, slot);
}

/**
 * Opens the tutor dropdown. Clicking before the page is interactive does nothing, so wait for the Book button,
 * which is enabled only once the page has hydrated.
 */
export async function openTutorDropdown(page: Page) {
  await expect(page.getByRole("button", { name: "Book consultation" })).toBeEnabled();
  await page.getByRole("combobox", { name: "Tutor" }).click();
  await expect(page.getByRole("searchbox", { name: "Search tutors by name" })).toBeVisible();
}

/** Opens the tutor dropdown, searches for the tutor by name and chooses them. */
export async function pickTutor(page: Page, tutor: { email: string }) {
  await openTutorDropdown(page);
  await page.getByRole("searchbox", { name: "Search tutors by name" }).fill(nameOf(tutor));
  await page.getByRole("option", { name: nameOf(tutor) }).click();
  await expect(page.getByRole("combobox", { name: "Tutor" })).toHaveText(nameOf(tutor));
}

/** Chooses the day and then the time of a slot in a slot picker (the booking form, or a reschedule dialog). */
export async function pickTime(scope: Page | Locator, slot: string) {
  const { dayLabel, label } = slotParts(slot);
  await scope.getByRole("combobox", { name: "Day" }).click();
  // The day list opens in a popup outside the dialog, so it is found from the page.
  await ("page" in scope && typeof scope.page === "function" ? scope.page() : (scope as Page))
    .getByRole("option", { name: dayLabel, exact: true })
    .click();
  const time = scope.getByRole("radio", { name: new RegExp(`^${label}`) });
  await expect(time).toBeEnabled();
  await time.check({ force: true }); // the radio is visually hidden; its label is the button
}

/** Books a slot with a tutor through the form. The reason is optional. */
export async function bookViaUi(page: Page, tutor: { email: string }, slot: string, reason?: string) {
  await chooseSlot(page, tutor, slot);
  if (reason) await page.getByRole("textbox", { name: /what would you like help with/i }).fill(reason);
  await page.getByRole("button", { name: "Book consultation" }).click();
  await expect(page.getByText("Consultation booked.")).toBeVisible();
}

/** A consultation card on the student's dashboard, found by its tutor and time. */
export const cardFor = (page: Page, tutor: { email: string }, slot: string) =>
  page.getByRole("listitem").filter({ hasText: nameOf(tutor) }).filter({ hasText: shownTime(slot) });

/** Searches a server-side table, which is how anything is found in a shared, growing database. */
export async function searchTable(page: Page, label: string, text: string) {
  // Typing before the page is interactive is lost, so wait for the list's own sign that it is live and has
  // loaded: a table's count line ("12 people", "3 consultations"), the pager ("Showing 1 to 3 of 3"), or the
  // student list's empty state.
  await expect(
    page.getByText(/^(\d+ (consultations?|sessions?|person|people)|Showing \d+ to \d+ of \d+|No consultations)/).first(),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: label }).fill(text);
  // The search runs on the server once typing pauses; the URL records it.
  await expect.poll(() => new URL(page.url()).searchParams.get("q"), { timeout: 15_000 }).toBe(text);
}

/**
 * Opens a page by address. A page can answer with a redirect after it has started streaming, which the browser
 * follows on the client: Playwright then reports the first navigation as aborted (net::ERR_ABORTED) although the
 * page is on its way where it should be. In development the first visit to a route can also reload an open
 * page while the dev server compiles it. Either way, wait for the page to settle; the test then asserts where it is.
 */
export async function visit(page: Page, path: string) {
  try {
    await page.goto(path);
  } catch (error) {
    if (!String(error).includes("ERR_ABORTED")) throw error;
    await page.waitForLoadState("load");
  }
}
