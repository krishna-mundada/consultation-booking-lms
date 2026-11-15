import { expect, test } from "@playwright/test";
import { createTestUser, signedInAs } from "../support/supabase";
import { loginViaUi, openWhenReady, signUpViaUi } from "../support/e2e";

// Authentication (AC-1) in a real browser: real cookies, redirects and the real Auth service.

test.describe("authentication", () => {
  test("sign up with a name, log out, log back in", async ({ page }) => {
    const { email, password } = await signUpViaUi(page);
    await expect(page.getByRole("heading", { name: "My consultations" })).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await loginViaUi(page, email, password);
    await expect(page.getByRole("heading", { name: "My consultations" })).toBeVisible();
  });

  test("everyone who signs up is a student, and the name they gave is how they are shown (A1, A3)", async ({ page }) => {
    const { email, password } = await signUpViaUi(page, { first: "Grace", last: "Hopper" });
    await expect(page.getByRole("button", { name: "Book consultation" })).toBeVisible(); // a student's screen

    // Read the profile the database made, as that user.
    const { id, db } = await signedInAs(email, password);
    const profile = await db.from("profiles").select("role, first_name, last_name, display_name").eq("id", id).single();
    expect(profile.data).toEqual({ role: "student", first_name: "Grace", last_name: "Hopper", display_name: "Grace Hopper" });
  });

  test("a wrong password is rejected with a visible error", async ({ page }) => {
    const user = await createTestUser("student");
    await openWhenReady(page, "/auth/login", "Login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password." })).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("signing up with an email that already has an account gives a gentle message, not the backend's", async ({
    page,
  }) => {
    const user = await createTestUser("student");
    await openWhenReady(page, "/auth/sign-up", "Sign up");
    await page.getByLabel("First name").fill("Ada");
    await page.getByLabel("Last name").fill("Lovelace");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByLabel("Repeat Password").fill(user.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /may already have an account/i })).toBeVisible();
    await expect(page.getByText(/user already registered/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/auth\/sign-up/);
  });

  test("opening the password page without a reset link explains that the link has expired", async ({ page }) => {
    await openWhenReady(page, "/auth/update-password", "Save new password");
    await page.getByLabel("New password").fill("a-new-password-1");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /reset link has expired/i })).toBeVisible();
  });

  test("anonymous visitors are sent to the login page", async ({ page }) => {
    for (const path of ["/dashboard", "/sessions", "/admin", "/admin/people"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/auth\/login/);
    }
  });
});
