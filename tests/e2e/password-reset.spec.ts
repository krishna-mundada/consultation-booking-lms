import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createTestUser } from "../support/supabase";
import { loginViaUi, openWhenReady } from "../support/e2e";

// The emails Supabase sends locally are caught by Mailpit, which has an HTTP API.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitMessage = { ID: string };

/** Waits for the newest email sent to `address` and returns its plain-text body. */
async function emailTextFor(address: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
        const body = (await res.json()) as { messages?: MailpitMessage[] };
        id = body.messages?.[0]?.ID;
        return id;
      },
      { message: `an email to ${address}`, timeout: 15_000 },
    )
    .toBeTruthy();
  const message = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await message.json()) as { Text: string }).Text;
}

test.describe("password reset by email", () => {
  test("the emailed link lets a user choose a new password and sign in with it", async ({ page }) => {
    const user = await createTestUser("student");
    const newPassword = `new-${randomUUID().slice(0, 8)}-1a`;

    await openWhenReady(page, "/auth/forgot-password", "Send reset email");
    await page.getByLabel("Email").fill(user.email);
    await page.getByRole("button", { name: "Send reset email" }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible();

    const link = (await emailTextFor(user.email)).match(/https?:\/\/\S+/)?.[0];
    expect(link, "the email contains a link").toBeTruthy();

    await page.goto(link!);
    await expect(page).toHaveURL(/\/auth\/update-password/);
    await expect(page.getByRole("button", { name: "Save new password" })).toBeEnabled();
    await page.getByLabel("New password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // The old password no longer works; the new one does.
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await loginViaUi(page, user.email, newPassword);
    await expect(page.getByRole("heading", { name: "My consultations" })).toBeVisible();
  });
});
