import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { apiActor } from "../support/api";
import { createTestUser, createTutor, uniqueSlot } from "../support/supabase";
import { loginAs, nameOf, openTutorDropdown, searchTable, shownTime, visit } from "../support/e2e";

// The three roles in a real browser (ADR 0007): what each lands on, what each is offered, what each is
// turned away from, and the admin's power to make and unmake tutors with its consequences for students.

test.describe("a tutor", () => {
  test("lands on their sessions, sees what students booked, and has nothing to change", async ({ page, baseURL }) => {
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const slot = uniqueSlot();
    const reason = `Tutor can see this ${randomUUID().slice(0, 8)}`;
    expect((await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: slot, reason } })).status()).toBe(201);

    await loginAs(page, tutor);
    await expect(page).toHaveURL(/\/sessions/);
    await expect(page.getByRole("heading", { name: "Sessions with me" })).toBeVisible();
    await expect(page.getByText("Tutor", { exact: true })).toBeVisible(); // the role badge
    await expect(page.getByRole("link", { name: "Sessions with me" })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: reason });
    await expect(row).toBeVisible();
    await expect(row).toContainText(shownTime(slot));
    await expect(row).toContainText(nameOf(student.user));
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(row.getByRole("checkbox")).toHaveCount(0);
  });

  test("is not offered a booking form, and is sent back from the student and admin screens", async ({ page }) => {
    const tutor = await createTutor();
    await loginAs(page, tutor);
    await expect(page.getByRole("button", { name: "Book consultation" })).toHaveCount(0);

    await visit(page, "/dashboard");
    await expect(page).toHaveURL(/\/sessions/);
    await visit(page, "/admin");
    await expect(page).toHaveURL(/\/sessions/);
    await visit(page, "/admin/people");
    await expect(page).toHaveURL(/\/sessions/);
  });
});

test.describe("an admin", () => {
  test("lands on all consultations, read-only, with Consultations and People to go to", async ({ page, baseURL }) => {
    const admin = await createTestUser("admin");
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const reason = `Visible to the admin ${randomUUID().slice(0, 8)}`;
    expect((await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: uniqueSlot(), reason } })).status()).toBe(201);

    await loginAs(page, admin);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole("heading", { name: "All consultations" })).toBeVisible();
    await expect(page.getByText("Admin", { exact: true })).toBeVisible(); // the role badge
    await expect(page.getByRole("link", { name: "People" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Book consultation" })).toHaveCount(0);

    await searchTable(page, "Search consultations", reason);
    const row = page.getByRole("row").filter({ hasText: reason });
    await expect(row).toBeVisible();
    await expect(row).toContainText(nameOf(tutor));
    await expect(row).toContainText(nameOf(student.user));
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(row.getByRole("checkbox")).toHaveCount(0);
  });

  test("is sent from the student dashboard to the admin screens", async ({ page }) => {
    const admin = await createTestUser("admin");
    await loginAs(page, admin);
    await visit(page, "/dashboard");
    await expect(page).toHaveURL(/\/admin/);
    // The brand link and the nav link are both called Consultations; the nav link is the last.
    await page.getByRole("link", { name: "Consultations", exact: true }).last().click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test("a student is turned away from the admin screens and the admin API", async ({ page }) => {
    const student = await createTestUser("student");
    await loginAs(page, student);
    await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);
    for (const path of ["/admin", "/admin/people"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/dashboard/);
    }
    for (const path of ["/api/admin/consultations", "/api/admin/people"]) {
      expect((await page.request.get(path)).status(), path).toBe(403);
    }
  });
});

test.describe("making and unmaking tutors", () => {
  test("an admin turns a student into a tutor, and students can then book them", async ({ browser }) => {
    const admin = await createTestUser("admin");
    const person = await createTestUser("student");
    const booker = await createTestUser("student");
    const adminCtx = await browser.newContext();
    const bookerCtx = await browser.newContext();
    const [adminPage, bookerPage] = [await adminCtx.newPage(), await bookerCtx.newPage()];

    await loginAs(adminPage, admin);
    await visit(adminPage, "/admin/people");
    await searchTable(adminPage, "Search people", person.email);
    const row = adminPage.getByRole("row").filter({ hasText: person.email });
    await expect(row.getByText("Student", { exact: true })).toBeVisible();
    await row.getByRole("switch").click();
    await expect(adminPage.getByRole("status").filter({ hasText: "is now a tutor and can be booked." })).toBeVisible();
    await expect(row.getByText("Tutor", { exact: true })).toBeVisible();
    await expect(row.getByRole("switch")).toBeChecked();

    // A student searching for them now finds them in the picker.
    await loginAs(bookerPage, booker);
    await openTutorDropdown(bookerPage);
    await bookerPage.getByRole("searchbox", { name: "Search tutors by name" }).fill(nameOf(person));
    await expect(bookerPage.getByRole("option", { name: nameOf(person) })).toBeVisible();

    await adminCtx.close();
    await bookerCtx.close();
  });

  test("turning off a tutor with upcoming consultations: Cancel notifies the students, who can dismiss it", async ({ browser, baseURL }) => {
    const admin = await createTestUser("admin");
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const slot = uniqueSlot();
    const reason = `Private reason ${randomUUID().slice(0, 8)}`;
    expect((await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: slot, reason } })).status()).toBe(201);

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await loginAs(adminPage, admin);
    await visit(adminPage, "/admin/people");
    await searchTable(adminPage, "Search people", tutor.email);
    const row = adminPage.getByRole("row").filter({ hasText: tutor.email });
    await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible(); // Upcoming
    await row.getByRole("switch").click();

    // The admin is asked first; nothing has happened yet.
    const dialog = adminPage.getByRole("dialog");
    await expect(dialog).toContainText("has 1 upcoming consultation");
    // The page behind a modal is hidden from assistive technology, so look the row up without roles.
    await expect(adminPage.locator("tr").filter({ hasText: tutor.email }).getByRole("switch", { includeHidden: true })).toBeChecked();
    await dialog.getByRole("button", { name: "Cancel them and notify" }).click();
    await expect(adminPage.getByRole("status").filter({ hasText: "1 upcoming consultation was cancelled and the students notified." })).toBeVisible();
    await expect(row.getByText("Student", { exact: true })).toBeVisible();
    await adminCtx.close();

    // The student sees the notice, in the agreed words, without the reason; the consultation is cancelled.
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    await loginAs(studentPage, student.user);
    const notice = studentPage.getByRole("region", { name: "Notices" });
    await expect(notice).toContainText(
      `Your consultation with ${nameOf(tutor)} on ${shownTime(slot)} was cancelled because the tutor is no longer available.`,
    );
    await expect(notice).not.toContainText(reason);
    await expect(studentPage.getByRole("listitem").filter({ hasText: reason }).getByText("Cancelled")).toBeVisible();

    // It stays until dismissed, across reloads; dismissing removes it for good.
    await studentPage.reload();
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: /dismiss/i }).click();
    await expect(notice).toHaveCount(0);
    await studentPage.reload();
    await expect(studentPage.getByRole("heading", { name: "My consultations" })).toBeVisible();
    await expect(studentPage.getByRole("region", { name: "Notices" })).toHaveCount(0);

    // The slot is free again, and the former tutor can no longer be booked.
    await openTutorDropdown(studentPage);
    await studentPage.getByRole("searchbox", { name: "Search tutors by name" }).fill(nameOf(tutor));
    await expect(studentPage.getByText("No tutor has that name.")).toBeVisible();
    await studentCtx.close();
  });

  test("Keep leaves the consultations as they were, tells no one, and the former tutor still sees them", async ({ browser, baseURL }) => {
    const admin = await createTestUser("admin");
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const slot = uniqueSlot();
    const reason = `Kept ${randomUUID().slice(0, 8)}`;
    expect((await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: slot, reason } })).status()).toBe(201);

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await loginAs(adminPage, admin);
    await visit(adminPage, "/admin/people");
    await searchTable(adminPage, "Search people", tutor.email);
    await adminPage.getByRole("row").filter({ hasText: tutor.email }).getByRole("switch").click();
    await adminPage.getByRole("dialog").getByRole("button", { name: "Keep them" }).click();
    await expect(adminPage.getByRole("status").filter({ hasText: "Their upcoming consultations were kept." })).toBeVisible();
    await adminCtx.close();

    // The student: nothing cancelled, nothing to dismiss.
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    await loginAs(studentPage, student.user);
    const card = studentPage.getByRole("listitem").filter({ hasText: reason });
    await expect(card.getByText("Scheduled")).toBeVisible();
    await expect(studentPage.getByRole("region", { name: "Notices" })).toHaveCount(0);
    await studentCtx.close();

    // The former tutor is a student now, but still sees the sessions on record.
    const formerCtx = await browser.newContext();
    const formerPage = await formerCtx.newPage();
    await loginAs(formerPage, tutor);
    await expect(formerPage).toHaveURL(/\/dashboard/);
    await formerPage.getByRole("link", { name: "Sessions with me" }).click();
    await expect(formerPage).toHaveURL(/\/sessions/);
    await expect(formerPage.getByRole("row").filter({ hasText: reason })).toBeVisible();
    await formerCtx.close();
  });
});
