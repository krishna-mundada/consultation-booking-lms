import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { apiActor } from "../support/api";
import { createTestUser, createTutor, uniqueSlot } from "../support/supabase";
import { bookViaUi, loginAs, openTutorDropdown, openWhenReady, searchTable, signUpViaUi, visit } from "../support/e2e";

// An automated WCAG 2.1 A/AA scan of every screen, in both colour schemes. Automated checks find
// roughly a third of accessibility problems (contrast, names, roles, landmarks, label wiring); the
// rest (focus order, wording) is covered by the behaviour tests and by hand.

const SCHEMES = ["light", "dark"] as const;

// axe-core's rules read the DOM and computed styles, so the result does not depend on the engine.
// Running it crashes Firefox's page process on the dashboard, so it runs in Chromium and WebKit.
test.skip(({ browserName }) => browserName === "firefox", "axe-core crashes Firefox's page process");

async function expectNoViolations(page: Page, where: string, options: { openSelect?: boolean } = {}) {
  // Dialogs and popups fade in; scanning mid-fade measures a half-transparent button, not the real colours.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const scan = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  // While a Radix Select list is open it marks the rest of the page aria-hidden but leaves it focusable, although
  // focus is trapped in the list so nobody can reach it. axe flags that as aria-hidden-focus; it is a known
  // behaviour of the library, so that one rule is skipped for the open-list scans (and only those).
  if (options.openSelect) scan.disableRules(["aria-hidden-focus"]);
  const { violations } = await scan.analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `${where}: ${summary.join("\n")}`).toEqual([]);
}

for (const scheme of SCHEMES) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the signed-out screens have no violations", async ({ page }) => {
      for (const [path, ready] of [
        ["/auth/login", "Login"],
        ["/auth/sign-up", "Sign up"],
        ["/auth/forgot-password", "Send reset email"],
      ] as const) {
        await openWhenReady(page, path, ready);
        await expectNoViolations(page, path);
      }
      await page.goto("/auth/error");
      await expectNoViolations(page, "/auth/error");
    });

    test("the student dashboard: empty, booking, the tutor and day dropdowns, errors and both dialogs", async ({ page }) => {
      const tutor = await createTutor();
      await signUpViaUi(page);
      await expectNoViolations(page, "the empty dashboard");

      await openTutorDropdown(page);
      await expect(page.getByRole("option").first()).toBeVisible();
      await expectNoViolations(page, "the tutor dropdown open");
      await page.keyboard.press("Escape");

      await bookViaUi(page, tutor, uniqueSlot(), "Accessibility check");
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await expectNoViolations(page, "the dashboard with a booking and the slot grid");

      await page.getByRole("combobox", { name: "Day" }).click();
      await expect(page.getByRole("option").first()).toBeVisible();
      await expectNoViolations(page, "the day dropdown open", { openSelect: true });
      await page.keyboard.press("Escape");

      await page.getByRole("combobox", { name: "Sort by" }).click();
      await expect(page.getByRole("option", { name: "Soonest first" })).toBeVisible();
      await expectNoViolations(page, "the sort dropdown open", { openSelect: true });
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Book consultation" }).click(); // nothing chosen: errors show
      await expect(page.getByText("Choose a day and a time")).toBeVisible();
      await expectNoViolations(page, "the booking form showing errors");

      await page.getByRole("button", { name: "Reschedule" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page, "the reschedule dialog");
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectNoViolations(page, "the cancel confirmation");
    });

    test("the dashboard with a long reason folded and opened", async ({ page, baseURL }) => {
      const tutor = await createTutor();
      const student = await apiActor(baseURL!);
      const res = await student.api.post("/api/consultations", {
        data: { tutor_id: tutor.id, scheduled_at: uniqueSlot(), reason: "a long reason that goes on ".repeat(20) },
      });
      expect(res.status()).toBe(201);
      await loginAs(page, student.user);
      await expect(page.getByRole("button", { name: "Read more" })).toBeVisible();
      await expectNoViolations(page, "a folded reason");
      await page.getByRole("button", { name: "Read more" }).click();
      await expectNoViolations(page, "an opened reason");
    });

    test("a tutor's sessions have no violations", async ({ page, baseURL }) => {
      const tutor = await createTutor();
      const student = await apiActor(baseURL!);
      await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: uniqueSlot(), reason: "for the tutor" } });
      await loginAs(page, tutor);
      await expect(page.getByRole("row").nth(1)).toBeVisible();
      await expectNoViolations(page, "/sessions");
    });

    test("the admin screens, including a notice and the demotion question, have no violations", async ({ page, baseURL }) => {
      const admin = await createTestUser("admin");
      const tutor = await createTutor();
      const student = await apiActor(baseURL!);
      const reason = `a11y ${randomUUID().slice(0, 8)}`;
      await student.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: uniqueSlot(), reason } });

      await loginAs(page, admin);
      await searchTable(page, "Search consultations", reason);
      await expect(page.getByRole("row").filter({ hasText: reason })).toBeVisible();
      await expectNoViolations(page, "/admin");

      await visit(page, "/admin/people");
      await searchTable(page, "Search people", tutor.email);
      const row = page.getByRole("row").filter({ hasText: tutor.email });
      await expect(row).toBeVisible();
      await expectNoViolations(page, "/admin/people");

      await row.getByRole("switch").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page, "the demotion question");
      await page.getByRole("dialog").getByRole("button", { name: "Cancel them and notify" }).click();
      await expect(page.getByRole("status").filter({ hasText: "notified" })).toBeVisible();

      // The student now has a notice.
      const other = await page.context().newPage();
      await loginAs(other, student.user);
      await expect(other.getByRole("region", { name: "Notices" })).toBeVisible();
      await expectNoViolations(other, "the dashboard with a notice");
    });
  });
}
