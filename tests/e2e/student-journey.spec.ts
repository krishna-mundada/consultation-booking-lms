import { expect, test, type Page } from "@playwright/test";
import { apiActor } from "../support/api";
import { createTutor, slotParts, uniqueSlot } from "../support/supabase";
import { bookViaUi, cardFor, chooseSlot, nameOf, pickTime, pickTutor, signUpViaUi } from "../support/e2e";

// The student's journey in a real browser against the real app and database (AC-2 to AC-6, ADR 0007
// A11 to A17). Only what the lower layers cannot prove lives here: wiring, persistence after reload,
// real cookies, and what two people at once see.

test.describe("booking a consultation", () => {
  test("book, tick off, reschedule and cancel, with everything surviving a reload", async ({ page, baseURL }) => {
    const tutor = await createTutor();
    await signUpViaUi(page);
    await expect(page.getByText("No consultations yet")).toBeVisible();

    // AC-4: book a tutor at a slot, with a reason.
    const slot = uniqueSlot();
    await bookViaUi(page, tutor, slot, "Year 12 subject advice");
    const card = cardFor(page, tutor, slot);
    await expect(card).toBeVisible();
    await expect(card).toContainText("Year 12 subject advice");
    await expect(card.getByText("Scheduled")).toBeVisible();
    // The form is ready for the next one: the tutor stays, the time and the reason are cleared.
    await expect(page.getByRole("textbox", { name: /what would you like help with/i })).toHaveValue("");
    await expect(page.getByRole("radio", { name: new RegExp(`^${slotParts(slot).label}`) })).not.toBeChecked();

    // AC-2: it is still there after a reload.
    await page.reload();
    await expect(card).toBeVisible();

    // AC-3: Completed means it happened, so it cannot be ticked before it starts (the database refuses too).
    await expect(card.getByRole("checkbox")).toBeDisabled();
    await expect(card).toContainText("(after it starts)");
    const early = await page.request.patch(`/api/consultations/${(await (await page.request.get("/api/consultations")).json()).data[0].id}`, {
      data: { action: "set_completed", completed: true },
    });
    expect(early.status()).toBe(409);

    // AC-5: reschedule with the same tutor. Only the day and time are asked for.
    const later = uniqueSlot();
    await card.getByRole("button", { name: "Reschedule" }).click();
    const dialog = page.getByRole("dialog", { name: /reschedule/i });
    await expect(dialog).toContainText(`Choose a new time with ${nameOf(tutor)}`);
    await expect(dialog.getByRole("searchbox")).toHaveCount(0);
    await pickTime(dialog, later);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    const moved = cardFor(page, tutor, later);
    await expect(moved).toContainText("Year 12 subject advice");
    await expect(cardFor(page, tutor, slot)).toHaveCount(0); // the time it left is gone

    // AC-6: cancel, after a confirmation. Keeping it changes nothing.
    await moved.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(moved.getByText("Cancelled")).toBeHidden();
    await moved.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(moved.getByText("Cancelled")).toBeVisible();
    await expect(moved.getByRole("button", { name: "Reschedule" })).toHaveCount(0);

    // AC-28, AC-29: still listed (soft cancel) and still cancelled after a reload.
    await page.reload();
    await expect(cardFor(page, tutor, later).getByText("Cancelled")).toBeVisible();

    // A cancelled consultation frees its slot: someone else can now book the same tutor then.
    const other = await apiActor(baseURL!);
    const res = await other.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: later } });
    expect(res.status()).toBe(201);
  });

  test("a time the tutor already has is crossed out and cannot be picked", async ({ page, baseURL }) => {
    const tutor = await createTutor();
    const slot = uniqueSlot();
    const other = await apiActor(baseURL!);
    expect((await other.api.post("/api/consultations", { data: { tutor_id: tutor.id, scheduled_at: slot } })).status()).toBe(201);

    await signUpViaUi(page);
    await pickTutor(page, tutor);
    await page.getByRole("combobox", { name: "Day" }).click();
    await page.getByRole("option", { name: slotParts(slot).dayLabel, exact: true }).click();
    const taken = page.getByRole("radio", { name: new RegExp(`^${slotParts(slot).label} \\(taken\\)`) });
    await expect(taken).toBeDisabled();
  });
});

test.describe("two people at once", () => {
  test("two students chasing the same slot: one wins, the other is told and sees it taken", async ({ browser }) => {
    const tutor = await createTutor();
    const slot = uniqueSlot();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const [a, b] = [await ctxA.newPage(), await ctxB.newPage()];
    await signUpViaUi(a);
    await signUpViaUi(b);

    // Both have the slot chosen, and both think it is free.
    await chooseSlot(a, tutor, slot);
    await chooseSlot(b, tutor, slot);

    await a.getByRole("button", { name: "Book consultation" }).click();
    await expect(a.getByText("Consultation booked.")).toBeVisible();

    await b.getByRole("button", { name: "Book consultation" }).click();
    await expect(b.getByText("That time was just taken. Please pick another slot.")).toBeVisible();
    // The form now shows the truth: the time is crossed out, and nothing was booked for B.
    await expect(b.getByRole("radio", { name: new RegExp(`^${slotParts(slot).label} \\(taken\\)`) })).toBeDisabled();
    await expect(b.getByRole("listitem")).toHaveCount(0);

    await ctxA.close();
    await ctxB.close();
  });

  test("one student cannot hold two consultations at the same time, even with different tutors", async ({ page }) => {
    const [t1, t2] = [await createTutor(), await createTutor()];
    const slot = uniqueSlot();
    await signUpViaUi(page);
    await bookViaUi(page, t1, slot);
    await chooseSlot(page, t2, slot);
    await page.getByRole("button", { name: "Book consultation" }).click();
    await expect(page.getByText("You already have a consultation at that time.")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });
});

test.describe("isolation between students (AC-8, AC-9)", () => {
  test("another student never sees or changes my consultation", async ({ browser }) => {
    const tutor = await createTutor();
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    const bob = await bobCtx.newPage();

    await signUpViaUi(alice);
    await bookViaUi(alice, tutor, uniqueSlot(), "Alice's private reason");
    await expect(alice.getByText("Alice's private reason")).toBeVisible();

    await signUpViaUi(bob);
    await expect(bob.getByText("Alice's private reason")).toHaveCount(0);
    await expect(bob.getByText("No consultations yet")).toBeVisible();

    // Even knowing the id, Bob cannot touch it.
    const id = (await (await alice.request.get("/api/consultations")).json()).data[0].id as string;
    expect((await bob.request.patch(`/api/consultations/${id}`, { data: { action: "cancel" } })).status()).toBe(404);

    await alice.reload();
    await expect(alice.getByRole("listitem").filter({ hasText: "Alice's private reason" })).not.toContainText("Cancelled");

    await aliceCtx.close();
    await bobCtx.close();
  });
});

test.describe("small screens (AC-20)", () => {
  const sidewaysScroll = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  test("the dashboard and login never scroll sideways, from a small phone to a wide desktop", async ({ page }) => {
    const tutor = await createTutor();
    await signUpViaUi(page);
    await bookViaUi(page, tutor, uniqueSlot(), "A reasonably long reason so the row has real content to wrap on a narrow screen");
    await expect(page.getByRole("listitem")).toHaveCount(1);

    for (const [width, height] of [
      [320, 568],
      [375, 667],
      [768, 1024],
      [1024, 768],
      [1440, 900],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await sidewaysScroll(page), `dashboard at ${width}px`).toBeLessThanOrEqual(0);
      await expect(page.getByRole("button", { name: "Book consultation" })).toBeVisible();
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    for (const width of [320, 768, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await sidewaysScroll(page), `login at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
});
