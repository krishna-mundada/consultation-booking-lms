import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ConsultationList } from "@/components/features/consultations/consultation-list";
import type { Outcome } from "@/lib/hooks/outcome";
import { API, mockApi } from "../support/msw";
import { chooseDay } from "../support/ui";
import { makeConsultation } from "../support/fixtures";

// The student's cards (AC-2, AC-3, AC-5, AC-6; ADR 0007 A6, A15, A17, A24). The clock is fixed at 11:00 Friday
// 27 Nov 2026 in Melbourne; only Date is faked.

const server = mockApi();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const TUE_10AM = "2026-11-30T23:00:00+00:00"; // 10:00 AEDT, Tue 1 Dec 2026
const ok: Outcome = { ok: true };
const failed = (message: string, status = 500): Outcome => ({ ok: false, message, fields: {}, status, sessionExpired: false });

function setup(items = [makeConsultation({ scheduled_at: TUE_10AM })], over: Partial<Parameters<typeof ConsultationList>[0]> = {}) {
  const actions = {
    onSetCompleted: vi.fn().mockResolvedValue(ok),
    onReschedule: vi.fn().mockResolvedValue(ok),
    onCancel: vi.fn().mockResolvedValue(ok),
  };
  render(<ConsultationList items={items} {...actions} {...over} />);
  return { ...actions, user: userEvent.setup() };
}

describe("what a card shows", () => {
  it("names the tutor, the Melbourne date and time with its zone, and the reason", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM, tutor_name: "Maya Chen", reason: "Essay help" })]);
    expect(screen.getByText("With Maya Chen")).toBeInTheDocument();
    expect(screen.getByText("Tue 1 Dec 2026, 10:00 am AEDT")).toBeInTheDocument();
    expect(screen.getByText("Essay help")).toBeInTheDocument();
  });

  it("says so when there is no reason, instead of leaving a gap", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM, reason: null })]);
    expect(screen.getByText("No reason given")).toBeInTheDocument();
  });

  it("does not show the student's own name (they know who they are)", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM, student_name: "Sam Taylor" })]);
    expect(screen.queryByText(/Sam Taylor/)).not.toBeInTheDocument();
  });

  it("cues how soon an upcoming one is, in Melbourne days", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM })]);
    expect(screen.getByText("In 4 days")).toBeInTheDocument();
  });

  it("groups by time alone: Upcoming has not started, Earlier has, whatever its status", () => {
    setup([
      makeConsultation({ scheduled_at: TUE_10AM, reason: "soon" }),
      makeConsultation({ scheduled_at: TUE_10AM, status: "cancelled", can_edit: false, can_complete: false, reason: "cancelled-future" }),
      makeConsultation({ scheduled_at: "2026-11-01T00:00:00+00:00", completed: true, reason: "done" }),
      makeConsultation({ scheduled_at: "2026-11-02T00:00:00+00:00", reason: "past-unmarked", can_edit: false }),
      makeConsultation({ scheduled_at: "2026-11-03T00:00:00+00:00", status: "cancelled", can_edit: false, can_complete: false, reason: "cancelled-past" }),
    ]);
    const upcoming = screen.getByRole("heading", { name: "Upcoming" }).parentElement!;
    const earlier = screen.getByRole("heading", { name: "Earlier" }).parentElement!;
    expect(within(upcoming).getByText("soon")).toBeInTheDocument();
    expect(within(upcoming).getByText("cancelled-future")).toBeInTheDocument(); // still to come by date, so Upcoming
    for (const reason of ["done", "past-unmarked", "cancelled-past"]) expect(within(earlier).getByText(reason)).toBeInTheDocument();
  });

  it("looks different for each state: completed, started but not marked complete, cancelled, scheduled", () => {
    setup([
      makeConsultation({ scheduled_at: TUE_10AM, reason: "a" }),
      makeConsultation({ scheduled_at: "2026-11-01T00:00:00+00:00", completed: true, reason: "b" }),
      makeConsultation({ scheduled_at: "2026-11-02T00:00:00+00:00", reason: "c", can_edit: false }),
      makeConsultation({ scheduled_at: TUE_10AM, status: "cancelled", can_edit: false, can_complete: false, reason: "d" }),
    ]);
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Not marked complete")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("explains why Completed is switched off for one that is still to come", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM, can_complete: false })]);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText("(after it starts)")).toBeInTheDocument();
  });

  it("folds a long reason behind Read more, and opens and closes it", async () => {
    const long = "word ".repeat(80).trim();
    const { user } = setup([makeConsultation({ scheduled_at: TUE_10AM, reason: long })]);
    expect(screen.queryByText(long)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Read more" }));
    expect(screen.getByText(long, { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getByRole("button", { name: "Read more" })).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves out an empty group", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM })]);
    expect(screen.queryByRole("heading", { name: "Earlier" })).not.toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("invites the first booking", () => {
    setup([]);
    expect(screen.getByText("No consultations yet")).toBeInTheDocument();
  });

  it("says nothing matched when a search or filter is limiting the list", () => {
    setup([], { narrowed: true });
    expect(screen.getByText("No consultations match")).toBeInTheDocument();
  });
});

describe("what the student can do", () => {
  it("ticks Completed, asking for the opposite of what it is now", async () => {
    const c = makeConsultation({ scheduled_at: TUE_10AM });
    const { onSetCompleted, user } = setup([c]);
    await user.click(screen.getByRole("checkbox", { name: /Completed: with Maya Chen on Tue 1 Dec 2026, 10:00 am AEDT/ }));
    expect(onSetCompleted).toHaveBeenCalledWith(c.id, true);
  });

  it("leaves Completed switched off when the API says it cannot be changed (cancelled)", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM, status: "cancelled", can_edit: false, can_complete: false })]);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("never shows a cancelled consultation as ticked", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM, status: "cancelled", completed: true, can_edit: false, can_complete: false })]);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("keeps Completed available after the consultation has started, but not Reschedule or Cancel (A17)", () => {
    setup([makeConsultation({ scheduled_at: "2026-11-20T00:00:00+00:00", can_edit: false, can_complete: true })]);
    expect(screen.getByRole("checkbox")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("offers Reschedule and Cancel only when the API says the student can edit", () => {
    setup([makeConsultation({ scheduled_at: TUE_10AM, can_edit: true })]);
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows the message when a change fails", async () => {
    const { onSetCompleted, user } = setup();
    onSetCompleted.mockResolvedValue(failed("Something went wrong"));
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});

describe("cancelling", () => {
  it("asks first, naming the tutor and the time, and does nothing if the student keeps it", async () => {
    const { onCancel, user } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Your consultation with Maya Chen on Tue 1 Dec 2026, 10:00 am AEDT will be cancelled");
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels once confirmed", async () => {
    const c = makeConsultation({ scheduled_at: TUE_10AM });
    const { onCancel, user } = setup([c]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Yes, cancel it" }));
    expect(onCancel).toHaveBeenCalledWith(c.id);
  });
});

describe("rescheduling", () => {
  const c = makeConsultation({ scheduled_at: TUE_10AM, tutor_id: "5eed0000-0000-0000-0000-0000000000a2" });

  function serveBusy() {
    server.use(http.get(`${API}/api/tutors/${c.tutor_id}/busy`, () => HttpResponse.json({ data: [] })));
  }

  async function open(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    return screen.findByRole("dialog");
  }

  it("keeps the same tutor and asks only for a new day and time", async () => {
    serveBusy();
    const { user } = setup([c]);
    const dialog = await open(user);
    expect(dialog).toHaveTextContent("Choose a new time with Maya Chen.");
    expect(within(dialog).getByRole("combobox", { name: "Day" })).toBeEnabled();
    expect(within(dialog).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the chosen slot as a UTC instant", async () => {
    serveBusy();
    const { onReschedule, user } = setup([c]);
    const dialog = await open(user);
    await chooseDay(user, "2026-12-02");
    const slot = await within(dialog).findByRole("radio", { name: /^2:00 pm/ });
    await waitFor(() => expect(slot).toBeEnabled());
    await user.click(slot);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onReschedule).toHaveBeenCalledWith(c.id, "2026-12-02T03:00:00.000Z"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("stays open with the message when the slot was just taken", async () => {
    serveBusy();
    const { onReschedule, user } = setup([c]);
    onReschedule.mockResolvedValue(failed("That time was just taken. Please pick another slot.", 409));
    const dialog = await open(user);
    await chooseDay(user, "2026-12-02");
    const slot = await within(dialog).findByRole("radio", { name: /^2:00 pm/ });
    await waitFor(() => expect(slot).toBeEnabled());
    await user.click(slot);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("That time was just taken. Please pick another slot.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
