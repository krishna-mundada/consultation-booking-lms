import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { apiActor, signInCookieHeader } from "../support/api";
import { createTestUser, createTutor, uniqueSlot } from "../support/supabase";
import {
  bookViaUi,
  cardFor,
  loginAs,
  newUnhydratedContext,
  openWhenReady,
  searchTable,
  shownTime,
  } from "../support/e2e";

// Behaviour that only shows up in a real browser: what survives logout, session expiry, layout
// with long text, what ends up in the URL, time zones, and the wording of auth screens.

test.describe("credentials do not outlive a login", () => {
  test("after logging out, the login form is empty", async ({ page }) => {
    const user = await createTestUser("student");
    await loginAs(page, user);
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await expect(page.getByLabel("Email")).toHaveValue("");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  });

  test("no password is left in the page after a successful login", async ({ page }) => {
    const user = await createTestUser("student");
    await loginAs(page, user);
    const leftover = await page.evaluate(() =>
      [...document.querySelectorAll("input[type=password]")].map((i) => (i as HTMLInputElement).value),
    );
    expect(leftover.filter(Boolean)).toEqual([]);
  });
});

test.describe("signed-out users see nothing of the previous session", () => {
  test("Back after logout does not reveal the previous user's data", async ({ page }) => {
    const tutor = await createTutor();
    const user = await createTestUser("student");
    const reason = `Private ${randomUUID().slice(0, 8)}`;
    await loginAs(page, user);
    await bookViaUi(page, tutor, uniqueSlot(), reason);
    await expect(page.getByRole("listitem").filter({ hasText: reason })).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await page.goBack();

    // A signed-out visitor is sent to the login page and sees none of the old session.
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByText(reason)).toHaveCount(0);
    await expect(page.getByText(user.email)).toHaveCount(0);
  });

  test("an expired session sends the user to the login page instead of stranding them", async ({ page }) => {
    const user = await createTestUser("student");
    await loginAs(page, user);
    // Let the page finish loading and become interactive before the session ends under it.
    await expect(page.getByRole("button", { name: "Book consultation" })).toBeEnabled();
    await expect(page.getByText("No consultations yet")).toBeVisible();

    await page.context().clearCookies(); // the session ends behind the page's back
    await page.getByRole("button", { name: "Upcoming" }).click(); // the list asks the server again

    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe("every time is Melbourne time, whatever zone the browser is in (ADR 0007, A12)", () => {
  test.use({ timezoneId: "America/New_York" });

  test("a browser in New York sees Melbourne times with their zone label, and picks days in Melbourne", async ({ page, baseURL }) => {
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    const slot = uniqueSlot();
    expect((await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: slot, reason: "zone check" } })).status()).toBe(201);

    await loginAs(page, student.user);
    const card = cardFor(page, tutor, slot);
    await expect(card).toBeVisible();
    await expect(card.locator("time")).toHaveText(shownTime(slot));
    await expect(card.locator("time")).toHaveText(/AE(D|S)T$/);
    await expect(page.getByText("All times are Melbourne time.")).toBeVisible();
  });
});

test.describe("the admin table stays readable", () => {
  const longReason = (marker: string) => `${marker} ${"x".repeat(900)}`; // 900 characters, no spaces

  for (const [width, height] of [
    [390, 844],
    [1200, 800],
  ] as const) {
    test(`at ${width}px a long reason does not push Status off-screen`, async ({ page, baseURL }) => {
      const tutor = await createTutor();
      const student = await apiActor(baseURL!);
      const marker = `long-reason-${randomUUID().slice(0, 8)}`;
      const res = await student.api.post("/api/consultations", {
        data: { tutor_id: tutor.id, scheduled_at: uniqueSlot(), reason: longReason(marker) },
      });
      expect(res.status()).toBe(201);

      const admin = await createTestUser("admin");
      await page.setViewportSize({ width, height });
      await loginAs(page, admin); // an admin lands on /admin
      await expect(page).toHaveURL(/\/admin/);
      await searchTable(page, "Search consultations", marker);
      await expect(page.getByRole("row").filter({ hasText: marker })).toBeVisible();
      // The long reason is folded behind Read more, so the row stays short.
      await expect(page.getByRole("row").filter({ hasText: marker }).getByRole("button", { name: "Read more" })).toBeVisible();

      // The status is on screen: a column from md up, folded under the time on a phone. Either way the visible
      // badge must end inside the viewport.
      const badge = page.getByRole("row").filter({ hasText: marker }).getByText("Scheduled").filter({ visible: true });
      const status = await badge.boundingBox();
      expect(status).not.toBeNull();
      expect(status!.x + status!.width).toBeLessThanOrEqual(width);

      const scrolls = await page.getByRole("table").evaluate((table) => {
        const wrapper = table.parentElement!;
        return wrapper.scrollWidth - wrapper.clientWidth;
      });
      expect(scrolls).toBeLessThanOrEqual(0); // no sideways scrolling needed to read a row
    });
  }
});

test.describe("long text stays inside its card", () => {
  test("a long unbroken reason is folded, and does not push the status badge out of the card on a phone", async ({ page, baseURL }) => {
    const tutor = await createTutor();
    const student = await apiActor(baseURL!);
    expect(
      (await student.api.post("/api/consultations", {
        data: { tutor_id: tutor.id, scheduled_at: uniqueSlot(), reason: `${"unbroken".repeat(60)} and some words after it` },
      })).status(),
    ).toBe(201);

    await page.setViewportSize({ width: 375, height: 667 });
    await loginAs(page, student.user);
    const card = page.getByRole("listitem").first();
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Read more" })).toBeVisible();

    const cardBox = await card.boundingBox();
    const badgeBox = await card.getByText("Scheduled").boundingBox();
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);

    // Opened, it still wraps inside the card.
    await card.getByRole("button", { name: "Read more" }).click();
    const opened = await card.boundingBox();
    expect(opened!.x + opened!.width).toBeLessThanOrEqual(375);
  });
});

test.describe("nothing a user types may end up in the URL", () => {
  test("the booking form cannot be submitted natively before the app is ready", async ({ browser, baseURL }) => {
    const user = await createTestUser("student");
    const cookieHeader = await signInCookieHeader(user.email, user.password);

    const context = await newUnhydratedContext(browser, baseURL!);
    await context.addCookies(
      cookieHeader.split("; ").map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: baseURL! };
      }),
    );
    const page = await context.newPage();
    await page.goto("/dashboard");

    const reason = page.getByRole("textbox", { name: /what would you like help with/i });
    await reason.fill("a private reason");
    await expect(page.getByRole("button", { name: "Book consultation" })).toBeDisabled();
    // The form posts, so even a native submission would keep the values out of the address.
    await expect(page.locator("form").first()).toHaveAttribute("method", "post");

    // Implicit submission (Enter) must not navigate: listen for a navigation, and expect none.
    const navigation = page.waitForEvent("framenavigated", { timeout: 1000 }).then(
      () => "navigated",
      () => "stayed",
    );
    await reason.press("Enter");
    expect(await navigation).toBe("stayed");
    expect(page.url()).toBe(`${baseURL}/dashboard`);
    expect(page.url()).not.toContain("private");
    await context.close();
  });
});

test.describe("credentials never end up in the URL", () => {
  for (const [path, button, fields] of [
    ["/auth/login", "Login", ["Email", "Password"]],
    ["/auth/sign-up", "Sign up", ["First name", "Last name", "Email", "Password", "Repeat Password"]],
    ["/auth/forgot-password", "Send reset email", ["Email"]],
  ] as const) {
    test(`${path} cannot be submitted natively before the app is ready`, async ({ browser, baseURL }) => {
      const context = await newUnhydratedContext(browser, baseURL!);
      const page = await context.newPage();
      await page.goto(path);

      for (const label of fields) await page.getByLabel(label, { exact: true }).fill("secret-value-1");
      await expect(page.getByRole("button", { name: button })).toBeDisabled();

      const navigation = page.waitForEvent("framenavigated", { timeout: 1000 }).then(
        () => "navigated",
        () => "stayed",
      );
      await page.getByLabel(fields[0], { exact: true }).press("Enter");
      expect(await navigation).toBe("stayed");
      expect(page.url()).not.toContain("secret-value");
      await context.close();
    });
  }
});

test.describe("the password rule is explained in plain words", () => {
  test("a weak password gets a friendly message, not a character list", async ({ page }) => {
    await openWhenReady(page, "/auth/sign-up", "Sign up");
    await page.getByLabel("First name").fill("Weak");
    await page.getByLabel("Last name").fill("Password");
    await page.getByLabel("Email").fill(`weak-${randomUUID()}@test.local`);
    for (const weak of ["abc123", "onlyletterspassword"]) {
      await page.getByLabel("Password", { exact: true }).fill(weak);
      await page.getByLabel("Repeat Password").fill(weak);
      await page.getByRole("button", { name: "Sign up" }).click();
      await expect(page.getByText("Use at least 8 characters, including letters and numbers.")).toBeVisible();
      await expect(page.getByText(/abcdefghijklmnopqrstuvwxyz/i)).toHaveCount(0);
    }
  });
});

test.describe("the error page cannot be made to say anything", () => {
  test("text in ?error= is not shown (content spoofing)", async ({ page }) => {
    await page.goto("/auth/error?error=Your%20account%20is%20locked,%20call%20555-0100");
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
    await expect(page.getByText("555-0100")).toHaveCount(0);
  });
});
