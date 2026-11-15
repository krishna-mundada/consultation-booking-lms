import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { BookingForm } from "@/components/features/consultations/booking-form";
import type { Outcome } from "@/lib/hooks/outcome";
import { API, mockApi } from "../support/msw";
import { chooseDay, chooseTutor } from "../support/ui";
import { listBody, makeTutor } from "../support/fixtures";

// Booking (AC-4, ADR 0007 A11-A16): choose a tutor, choose one of their free slots, optionally say what
// it is about. The clock is fixed at 11:00 Friday 27 Nov 2026 in Melbourne; only Date is faked.

const server = mockApi();
const maya = makeTutor({ display_name: "Maya Chen" });
const MONDAY_10_30 = "2026-11-29T23:30:00.000Z"; // 10:30 AEDT on Monday 30 Nov

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function serve(busy: string[] = []) {
  const busyRequests: string[] = [];
  server.use(
    http.get(`${API}/api/tutors`, () => HttpResponse.json(listBody([maya]))),
    http.get(`${API}/api/tutors/${maya.id}/busy`, ({ request }) => {
      busyRequests.push(request.url);
      return HttpResponse.json({ data: busy });
    }),
  );
  return busyRequests;
}

const ok: Outcome = { ok: true };
const failed = (message: string, status: number, fields: Record<string, string[]> = {}): Outcome => ({
  ok: false,
  message,
  fields,
  status,
  sessionExpired: false,
});

function setup(onSubmit = vi.fn().mockResolvedValue(ok)) {
  render(<BookingForm onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

async function chooseTutorAndSlot(user: ReturnType<typeof userEvent.setup>) {
  await chooseTutor(user, "Maya Chen");
  await chooseDay(user, "2026-11-30");
  const slot = await screen.findByRole("radio", { name: /^10:30 am/ });
  await waitFor(() => expect(slot).toBeEnabled());
  await user.click(slot);
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /book consultation/i }));

describe("the form", () => {
  it("asks for a tutor, a day and time, and an optional reason: no names, no free-typed time", async () => {
    serve();
    setup();
    expect(screen.getByRole("combobox", { name: "Tutor" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Day" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /what would you like help with/i })).toBeInTheDocument();
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/first name|last name|date and time/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /book consultation/i })).toBeEnabled();
  });

  it("will not submit without a tutor and a time, and says what is missing", async () => {
    serve();
    const { onSubmit, user } = setup();
    await submit(user);
    expect(await screen.findByText("Choose a tutor from the list")).toBeInTheDocument();
    expect(screen.getByText("Choose a day and a time")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("with a tutor but no time, asks only for the time", async () => {
    serve();
    const { onSubmit, user } = setup();
    await chooseTutor(user, "Maya Chen");
    await submit(user);
    expect(await screen.findByText("Choose a day and a time")).toBeInTheDocument();
    expect(screen.queryByText("Choose a tutor from the list")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the tutor, the slot as a UTC instant and the trimmed reason", async () => {
    serve();
    const { onSubmit, user } = setup();
    await chooseTutorAndSlot(user);
    await user.type(screen.getByRole("textbox", { name: /what would you like help with/i }), "  Exam prep  ");
    await submit(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ tutor_id: maya.id, reason: "Exam prep", scheduled_at: MONDAY_10_30 });
  });

  it("books without a reason (it is optional): none is sent as null", async () => {
    serve();
    const { onSubmit, user } = setup();
    await chooseTutorAndSlot(user);
    await submit(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ tutor_id: maya.id, reason: null, scheduled_at: MONDAY_10_30 });
  });
});

describe("after submitting", () => {
  it("confirms, clears the time and the reason, keeps the tutor, and loads the availability again", async () => {
    const busyRequests = serve();
    const { user } = setup();
    await chooseTutorAndSlot(user);
    await user.type(screen.getByRole("textbox", { name: /what would you like help with/i }), "x");
    await waitFor(() => expect(busyRequests).toHaveLength(1));

    await submit(user);

    expect(await screen.findByText("Consultation booked.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /what would you like help with/i })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Tutor" })).toHaveTextContent("Maya Chen");
    await waitFor(() => expect(busyRequests).toHaveLength(2)); // the slot just booked is now taken
    expect(screen.getByRole("radio", { name: /^10:30 am/ })).not.toBeChecked();
  });

  it("says the slot was just taken, clears it, and shows what is free now", async () => {
    const busyRequests = serve();
    const onSubmit = vi.fn().mockResolvedValue(failed("That time was just taken. Please pick another slot.", 409));
    const { user } = setup(onSubmit);
    await chooseTutorAndSlot(user);
    await waitFor(() => expect(busyRequests).toHaveLength(1));

    await submit(user);

    expect(await screen.findByText("That time was just taken. Please pick another slot.")).toBeInTheDocument();
    expect(screen.queryByText("Consultation booked.")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^10:30 am/ })).not.toBeChecked();
    await waitFor(() => expect(busyRequests).toHaveLength(2));
  });

  it("puts a server message about a field next to that field", async () => {
    serve();
    const onSubmit = vi.fn().mockResolvedValue(failed("Invalid request", 400, { scheduled_at: ["Pick one of the available half-hour slots"] }));
    const { user } = setup(onSubmit);
    await chooseTutorAndSlot(user);
    await submit(user);
    expect(await screen.findByText("Pick one of the available half-hour slots")).toBeInTheDocument();
  });

  it("shows any other failure under the button", async () => {
    serve();
    const onSubmit = vi.fn().mockResolvedValue(failed("Something went wrong", 500));
    const { user } = setup(onSubmit);
    await chooseTutorAndSlot(user);
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("disables the button while booking, so one click is one booking", async () => {
    serve();
    let finish: (outcome: Outcome) => void = () => {};
    const onSubmit = vi.fn(() => new Promise<Outcome>((resolve) => (finish = resolve)));
    const { user } = setup(onSubmit);
    await chooseTutorAndSlot(user);
    await submit(user);
    expect(await screen.findByRole("button", { name: /booking/i })).toBeDisabled();
    finish(ok);
    expect(await screen.findByText("Consultation booked.")).toBeInTheDocument();
  });

  it("changing the tutor clears the chosen time", async () => {
    serve();
    const jordan = makeTutor({ display_name: "Jordan Reyes" });
    server.use(
      http.get(`${API}/api/tutors`, () => HttpResponse.json(listBody([maya, jordan]))),
      http.get(`${API}/api/tutors/${jordan.id}/busy`, () => HttpResponse.json({ data: [] })),
    );
    const { onSubmit, user } = setup();
    await chooseTutorAndSlot(user);
    await chooseTutor(user, "Jordan Reyes");
    await submit(user);
    expect(await screen.findByText("Choose a day and a time")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
