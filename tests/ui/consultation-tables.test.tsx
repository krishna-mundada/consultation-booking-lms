import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { AdminConsultationsTable, TutorSessionsTable } from "@/components/features/consultations/consultation-tables";
import { API, mockApi } from "../support/msw";
import { listBody, makeConsultation } from "../support/fixtures";
import { navigation } from "../support/navigation";

// The two read-only tables (ADR 0007, A6, A7, A9): an admin's view of everything, and a tutor's view of the
// sessions booked with them. Nothing in either can change a consultation.

const server = mockApi();

const row = makeConsultation({
  scheduled_at: "2026-11-30T23:00:00+00:00", // 10:00 AEDT Tue 1 Dec 2026
  tutor_name: "Maya Chen",
  student_name: "Sam Taylor",
  reason: "Essay help",
  can_edit: false,
  can_complete: false,
});

function serve(path: string, rows = [row]) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${API}${path}`, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(listBody(rows, { size: 20 }));
    }),
  );
  return requests;
}

describe("AdminConsultationsTable", () => {
  it("shows when (Melbourne time and zone), tutor, student, reason and status", async () => {
    serve("/api/admin/consultations");
    render(<AdminConsultationsTable />);
    const time = await screen.findByText("Tue 1 Dec 2026, 10:00 am AEDT");
    const tr = time.closest("tr")!;
    // On a phone the first cell repeats these under the time (the other columns appear from md up), and
    // jsdom applies no CSS, so each is there twice; what matters is that each is on the row.
    for (const text of ["Maya Chen", "Sam Taylor", "Essay help", "Scheduled"]) expect(within(tr).getAllByText(text).length).toBeGreaterThan(0);
    expect(within(tr).getAllByText("Maya Chen")).toHaveLength(2);
  });

  it("is read-only: nothing in a row can be clicked or ticked", async () => {
    serve("/api/admin/consultations");
    render(<AdminConsultationsTable />);
    const tr = (await screen.findByText("Tue 1 Dec 2026, 10:00 am AEDT")).closest("tr")!;
    expect(within(tr).queryByRole("button")).not.toBeInTheDocument();
    expect(within(tr).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says when there is no reason", async () => {
    serve("/api/admin/consultations", [makeConsultation({ reason: null, scheduled_at: row.scheduled_at })]);
    render(<AdminConsultationsTable />);
    expect((await screen.findAllByText("No reason given")).length).toBeGreaterThan(0);
  });

  it("starts newest first, with nothing filtered", async () => {
    const requests = serve("/api/admin/consultations");
    render(<AdminConsultationsTable />);
    await screen.findByText("Tue 1 Dec 2026, 10:00 am AEDT");
    expect(Object.fromEntries(requests[0])).toEqual({ "page[number]": "1", "page[size]": "20", sort: "-scheduled_at" });
  });

  it("searches, and filters by when and by status", async () => {
    const requests = serve("/api/admin/consultations");
    const user = userEvent.setup();
    render(<AdminConsultationsTable />);
    await screen.findByText("Tue 1 Dec 2026, 10:00 am AEDT");
    await user.click(screen.getByRole("button", { name: "Upcoming" }));
    await user.click(screen.getByRole("button", { name: "Cancelled" }));
    await waitFor(() => expect(requests.at(-1)?.get("filter[status]")).toBe("cancelled"));
    expect(requests.at(-1)?.get("filter[when]")).toBe("upcoming");
    expect(Object.fromEntries(new URLSearchParams(navigation.search))).toEqual({ status: "cancelled", when: "upcoming" });
  });
});

describe("TutorSessionsTable", () => {
  it("shows the student, not the tutor's own name, and is read-only", async () => {
    serve("/api/tutor/sessions");
    render(<TutorSessionsTable />);
    const cell = await screen.findByRole("cell", { name: "Sam Taylor" });
    expect(within(cell.closest("tr")!).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /tutor/i })).not.toBeInTheDocument();
  });

  it("opens on upcoming sessions, soonest first: a tutor does not start in years of history", async () => {
    const requests = serve("/api/tutor/sessions");
    render(<TutorSessionsTable />);
    await screen.findByRole("cell", { name: "Sam Taylor" });
    expect(requests[0].get("filter[when]")).toBe("upcoming");
    expect(requests[0].get("sort")).toBe("scheduled_at");
    expect(screen.getByRole("button", { name: "Upcoming" })).toHaveAttribute("aria-pressed", "true");
    expect(navigation.replaced).toEqual([]); // the starting filter is not written to the URL
  });

  it("shows everything on All, which the URL remembers, and past ones on Past", async () => {
    const requests = serve("/api/tutor/sessions");
    const user = userEvent.setup();
    render(<TutorSessionsTable />);
    await screen.findByRole("cell", { name: "Sam Taylor" });

    await user.click(within(screen.getByRole("group", { name: "When" })).getByRole("button", { name: "All" }));
    await waitFor(() => expect(requests.length).toBe(2));
    expect(requests[1].has("filter[when]")).toBe(false);
    expect(navigation.search).toBe("when=all");

    await user.click(screen.getByRole("button", { name: "Past" }));
    await waitFor(() => expect(requests.at(-1)?.get("filter[when]")).toBe("past"));
  });

  it("explains an empty starting view, rather than claiming a search found nothing", async () => {
    serve("/api/tutor/sessions", []);
    render(<TutorSessionsTable />);
    expect(await screen.findByText("No upcoming sessions. When a student books you, it shows up here.")).toBeInTheDocument();
    expect(screen.queryByText(/No sessions match/)).not.toBeInTheDocument();
    expect(screen.getByText("0 sessions")).toBeInTheDocument(); // not "0 sessions match": nothing was searched
  });

  it("points to All when a search or filter finds nothing", async () => {
    serve("/api/tutor/sessions", []);
    navigation.set("when=past");
    render(<TutorSessionsTable />);
    expect(await screen.findByText(/No sessions match/)).toBeInTheDocument();
  });
});
