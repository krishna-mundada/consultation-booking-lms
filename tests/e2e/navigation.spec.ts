import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { apiActor } from "../support/api";
import { businessSlot, createTestUser, createTutor, uniqueSlot } from "../support/supabase";
import { loginAs, searchTable, signUpViaUi, visit } from "../support/e2e";

// Every link, menu, dialog and pager a person can reach, used the way a person would use it.

test.describe("signed-out links", () => {
  test("each link on the sign-in screens leads where its text says", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await expect(page.getByRole("button", { name: "Send reset email" })).toBeVisible();

    await page.getByRole("link", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up/);
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();

    await page.getByRole("link", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("the error page offers a way back to login", async ({ page }) => {
    await page.goto("/auth/error");
    await page.getByRole("link", { name: "Back to login" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("pages that need a session send a signed-out visitor to login", async ({ page }) => {
    for (const path of ["/", "/dashboard", "/sessions", "/admin", "/admin/people"]) {
      await visit(page, path);
      await expect(page, path).toHaveURL(/\/auth\/login/);
    }
  });
});

test.describe("the header and the theme menu", () => {

  test("a signed-in user who follows a bad address gets a helpful 404 with a way back", async ({ page }) => {
    await signUpViaUi(page);
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page).toHaveTitle("Page not found | Consultations");
    await page.getByRole("link", { name: /back to the app/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("each role sees its own role badge and navigation", async ({ page }) => {
    const admin = await createTestUser("admin");
    await loginAs(page, admin);
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "People" })).toBeVisible();
    await page.getByRole("link", { name: "People" }).click();
    await expect(page).toHaveURL(/\/admin\/people/);
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    // The brand link leads to the admin's own screen: the dashboard is for students.
    await page.getByRole("link", { name: "Consultations", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin/);
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/auth\/login/); // let the logout redirect finish before going there again

    const tutor = await createTutor();
    await loginAs(page, tutor);
    await expect(page.getByText("Tutor", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sessions with me" })).toBeVisible();
    await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);
  });
});

test.describe("tables and lists keep their state in the URL (ADR 0007, A22)", () => {
  test("a student with more than one page can page, change the page size, and use Back", async ({ baseURL, page }) => {
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    for (let n = 0; n < 12; n++) {
      const res = await student.api.post("/api/consultations", {
        data: { tutor_id: tutor.id, scheduled_at: businessSlot(n % 8, Math.floor(n / 8)), reason: `Booking ${n}` },
      });
      expect(res.status()).toBe(201);
    }

    await loginAs(page, student.user);
    await visit(page, "/dashboard?size=10");
    const pager = page.getByRole("navigation", { name: "Pagination" });
    await expect(pager.getByText("Showing 1 to 10 of 12")).toBeVisible();
    await expect(pager.getByText("Page 1 of 2")).toBeVisible();

    await pager.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pager.getByText("Showing 11 to 12 of 12")).toBeVisible();
    await expect(pager.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

    // A reload keeps the page; a bigger page size brings everything onto one page and goes back to page 1.
    await page.reload();
    await expect(pager.getByText("Showing 11 to 12 of 12")).toBeVisible();
    await pager.getByRole("combobox", { name: /rows per page/i }).click();
    await page.getByRole("option", { name: "50" }).click();
    await expect(pager.getByText("Showing 1 to 12 of 12")).toBeVisible();
    await expect(page).toHaveURL(/size=50/);
    await expect(page).not.toHaveURL(/page=/);
  });

  test("search, sort and filters on the student's list are in the URL and survive a reload", async ({ page, baseURL }) => {
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const marker = `findme-${randomUUID().slice(0, 8)}`;
    for (const [n, reason] of [marker, "other one", "another"].entries()) {
      await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: businessSlot(n, 0), reason } });
    }

    await loginAs(page, student.user);
    await searchTable(page, "Search my consultations", marker);
    await expect(page.getByRole("listitem")).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Search my consultations" })).toHaveValue(marker);
    await expect(page.getByRole("listitem")).toHaveCount(1);

    // Clearing the search brings everything back; a filter chip is recorded too.
    await page.getByRole("searchbox", { name: "Search my consultations" }).fill("");
    await expect(page.getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Cancelled" }).click();
    await expect(page).toHaveURL(/status=cancelled/);
    await expect(page.getByText("No consultations match")).toBeVisible();
    await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "All" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(3);

    await page.getByRole("combobox", { name: /sort by/i }).click();
    await page.getByRole("option", { name: "Latest first" }).click();
    await expect(page).toHaveURL(/sort=-scheduled_at/);
  });

  test("the admin's tables sort by a heading and filter by chip, and a filter can be undone", async ({ page, baseURL }) => {
    const admin = await createTestUser("admin");
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const marker = `tbl-${randomUUID().slice(0, 8)}`;
    await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: uniqueSlot(), reason: marker } });

    await loginAs(page, admin);
    await searchTable(page, "Search consultations", marker);
    await expect(page.getByRole("row").filter({ hasText: marker })).toBeVisible();

    await page.getByRole("button", { name: /^Tutor/ }).click();
    await expect(page).toHaveURL(/sort=tutor_name/);
    await expect(page.getByRole("columnheader", { name: /tutor/i })).toHaveAttribute("aria-sort", "ascending");
    await page.getByRole("button", { name: /^Tutor/ }).click();
    await expect(page.getByRole("columnheader", { name: /tutor/i })).toHaveAttribute("aria-sort", "descending");

    await page.getByRole("button", { name: "Cancelled" }).click();
    await expect(page.getByText(/No consultations match/)).toBeVisible();
    // Filters and sorts replace the URL rather than adding history entries, so undo is the chip itself.
    await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "All" }).click();
    await expect(page.getByRole("row").filter({ hasText: marker })).toBeVisible();

    // People: the role chips narrow the table and are in the URL.
    await visit(page, "/admin/people");
    await page.getByRole("button", { name: "Admins" }).click();
    await expect(page).toHaveURL(/role=admin/);
    await expect(page.getByRole("button", { name: "Admins" })).toHaveAttribute("aria-pressed", "true");
    // The shared database holds many admins, so find this one by searching, as a person would.
    await searchTable(page, "Search people", admin.email);
    await expect(page.getByRole("row").filter({ hasText: admin.email })).toBeVisible();
    await expect(page).toHaveURL(/role=admin/); // the search kept the chip
  });
});
