import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { SlotPicker } from "@/components/features/consultations/slot-picker";
import { API, mockApi } from "../support/msw";
import { chooseDay } from "../support/ui";
import { errorBody } from "../support/fixtures";

// Choosing a day and a half-hour slot with a tutor (ADR 0007, A11-A14). The clock is fixed at
// 11:00 on Friday 27 November 2026 in Melbourne (00:00Z, daylight time), so what is "too soon" is known.
// Only Date is faked: timers stay real so the mock API and the waits behave normally.

const server = mockApi();
const TUTOR = "5eed0000-0000-0000-0000-0000000000a2";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const serveBusy = (busy: string[]) => {
  const requests: { from: string | null; to: string | null }[] = [];
  server.use(
    http.get(`${API}/api/tutors/${TUTOR}/busy`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push({ from: params.get("from"), to: params.get("to") });
      return HttpResponse.json({ data: busy });
    }),
  );
  return requests;
};

function setup(props: Partial<Parameters<typeof SlotPicker>[0]> = {}) {
  const onChange = vi.fn();
  const view = render(<SlotPicker tutorId={TUTOR} value={null} onChange={onChange} {...props} />);
  return { onChange, user: userEvent.setup(), ...view };
}

const day = () => screen.getByRole("combobox", { name: "Day" });
// A switched-off time carries its reason in its accessible name ("1:30 pm (taken)"), so match the start.
const slot = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });

describe("choosing a day", () => {
  it("is switched off until a tutor is chosen, and says so", () => {
    setup({ tutorId: null });
    expect(day()).toBeDisabled();
    expect(day()).toHaveTextContent("Choose a tutor first");
  });

  it("offers weekdays only, starting today, for as long as there is a slot to book", async () => {
    const { user } = setup();
    expect(day()).toHaveTextContent("Choose a day");
    await user.click(day());
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels[0]).toBe("Fri 27 Nov");
    expect(labels[1]).toBe("Mon 30 Nov"); // the weekend is skipped
    expect(labels.some((l) => /^(Sat|Sun)/.test(l ?? ""))).toBe(false);
    expect(labels.at(-1)).toBe("Fri 22 Jan"); // 56 days on
  });

  it("shows no times until a day is chosen", () => {
    setup();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});

describe("the times of a day", () => {
  it("asks for the tutor's bookings across that Melbourne day, 9:00 to 17:00", async () => {
    const requests = serveBusy([]);
    const { user } = setup();
    await chooseDay(user, "2026-11-27");
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ from: "2026-11-26T22:00:00.000Z", to: "2026-11-27T06:00:00.000Z" });
  });

  it("names the time zone, in daylight time here", async () => {
    serveBusy([]);
    const { user } = setup();
    await chooseDay(user, "2026-11-27");
    expect(await screen.findByText(/Melbourne time, AEDT/)).toBeInTheDocument();
  });

  it("shows sixteen half-hour slots, 9:00 am to 4:30 pm", async () => {
    serveBusy([]);
    const { user } = setup();
    await chooseDay(user, "2026-11-30"); // a Monday: nothing is too soon
    await waitFor(() => expect(slot("9:00 am")).toBeEnabled());
    expect(screen.getAllByRole("radio")).toHaveLength(16);
    expect(slot("4:30 pm")).toBeEnabled();
  });

  it("switches off a time the tutor already has, and one less than an hour away", async () => {
    // Taken: 1:30 pm (02:30Z). Today it is 11:00, so 9:00 to 11:30 are within the hour or past.
    serveBusy(["2026-11-27T02:30:00+00:00"]);
    const { user } = setup();
    await chooseDay(user, "2026-11-27");
    await waitFor(() => expect(slot("12:00 pm")).toBeEnabled());
    expect(slot("1:30 pm")).toBeDisabled();
    expect(slot("9:00 am")).toBeDisabled();
    expect(slot("11:30 am")).toBeDisabled();
    // The reason is available to a screen reader, not only as a line through the text.
    expect(screen.getByText("(taken)")).toBeInTheDocument();
    expect(screen.getAllByText("(too soon to book)").length).toBeGreaterThan(0);
  });

  it("switches everything off while the availability is loading", async () => {
    server.use(
      http.get(`${API}/api/tutors/${TUTOR}/busy`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ data: [] });
      }),
    );
    const { user } = setup();
    await chooseDay(user, "2026-11-30");
    expect(screen.getByText("Checking availability…")).toBeInTheDocument();
    expect(slot("9:00 am")).toBeDisabled();
    await waitFor(() => expect(slot("9:00 am")).toBeEnabled());
  });

  it("reports the chosen slot as a UTC instant", async () => {
    serveBusy([]);
    const { onChange, user } = setup();
    await chooseDay(user, "2026-11-30");
    await waitFor(() => expect(slot("10:30 am")).toBeEnabled());
    await user.click(slot("10:30 am"));
    expect(onChange).toHaveBeenCalledWith("2026-11-29T23:30:00.000Z");
  });

  it("shows the chosen slot as selected", async () => {
    serveBusy([]);
    setup({ value: "2026-11-29T23:30:00.000Z" });
    const user = userEvent.setup();
    await chooseDay(user, "2026-11-30");
    await waitFor(() => expect(slot("10:30 am")).toBeChecked());
  });

  it("clears the chosen slot when the day changes", async () => {
    serveBusy([]);
    const { onChange, user } = setup();
    await chooseDay(user, "2026-11-30");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("loads again when the form says the availability is out of date", async () => {
    const requests = serveBusy([]);
    const { user, rerender } = setup();
    await chooseDay(user, "2026-11-30");
    await waitFor(() => expect(requests).toHaveLength(1));
    rerender(<SlotPicker tutorId={TUTOR} value={null} onChange={vi.fn()} refreshToken={1} />);
    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it("shows an error with a way to try again, and keeps every time switched off meanwhile", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/tutors/${TUTOR}/busy`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 })
          : HttpResponse.json({ data: [] });
      }),
    );
    const { user } = setup();
    await chooseDay(user, "2026-11-30");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(slot("9:00 am")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(slot("9:00 am")).toBeEnabled());
  });

  it("shows an error the form passes in, tied to the day", () => {
    setup({ error: "Choose a day and a time" });
    expect(day()).toHaveAccessibleDescription("Choose a day and a time");
  });
});
