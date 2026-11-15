import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { NotificationBanner, notificationText } from "@/components/features/notifications/notification-banner";
import type { Notification } from "@/lib/schemas/notifications";
import { API, mockApi } from "../support/msw";
import { errorBody, listBody, makeNotification } from "../support/fixtures";

// In-app notices (ADR 0007, A10, A18): shown until dismissed, never repeating the consultation's reason.

const server = mockApi();
const URL_ = `${API}/api/notifications`;

/** A mock inbox that behaves like the API: unread ones are listed, dismissing marks one read. */
function serveInbox(initial: Notification[]) {
  const inbox = [...initial];
  const requests: string[] = [];
  server.use(
    http.get(URL_, ({ request }) => {
      requests.push(new URL(request.url).search);
      const unread = inbox.filter((n) => n.read_at === null);
      const size = Number(new URL(request.url).searchParams.get("page[size]"));
      return HttpResponse.json(listBody(unread.slice(0, size), { total: unread.length, size }));
    }),
    http.patch(`${URL_}/:id`, async ({ params, request }) => {
      expect(await request.json()).toEqual({ read: true });
      const n = inbox.find((x) => x.id === params.id)!;
      n.read_at = "2026-11-21T00:00:00+00:00";
      return HttpResponse.json({ data: n });
    }),
  );
  return { inbox, requests };
}

describe("the wording", () => {
  it("names the tutor and the time in Melbourne time with its zone, and gives the reason for it", () => {
    expect(notificationText(makeNotification({ tutor_name: "Maya Chen" }))).toBe(
      "Your consultation with Maya Chen on Fri 27 Nov 2026, 10:00 am AEDT was cancelled because the tutor is no longer available.",
    );
  });
});

describe("NotificationBanner", () => {
  it("asks only for unread notices, newest first", async () => {
    const { requests } = serveInbox([]);
    render(<NotificationBanner />);
    await waitFor(() => expect(requests).toHaveLength(1));
    const query = new URLSearchParams(requests[0]);
    expect(query.get("filter[read]")).toBe("false");
    expect(query.get("sort")).toBe("-created_at");
  });

  it("renders nothing at all when there is nothing to say", async () => {
    const { requests } = serveInbox([]);
    const { container } = render(<NotificationBanner />);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows each notice with its message and a Dismiss button", async () => {
    serveInbox([makeNotification({ tutor_name: "Maya Chen" }), makeNotification({ tutor_name: "Jordan Reyes" })]);
    render(<NotificationBanner />);
    expect(await screen.findByText(/Your consultation with Maya Chen/)).toBeInTheDocument();
    expect(screen.getByText(/Your consultation with Jordan Reyes/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /dismiss/i })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Notices" })).toBeInTheDocument();
  });

  it("dismisses one notice and keeps the others", async () => {
    serveInbox([makeNotification({ tutor_name: "Maya Chen" }), makeNotification({ tutor_name: "Jordan Reyes" })]);
    const user = userEvent.setup();
    render(<NotificationBanner />);
    await user.click(await screen.findByRole("button", { name: /Dismiss: your consultation with Maya Chen/ }));
    await waitFor(() => expect(screen.queryByText(/Maya Chen/)).not.toBeInTheDocument());
    expect(screen.getByText(/Jordan Reyes/)).toBeInTheDocument();
  });

  it("goes away entirely when the last notice is dismissed", async () => {
    serveInbox([makeNotification()]);
    const user = userEvent.setup();
    const { container } = render(<NotificationBanner />);
    await user.click(await screen.findByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows five at a time and says how many more there are", async () => {
    serveInbox(Array.from({ length: 7 }, (_, i) => makeNotification({ tutor_name: `Tutor ${i + 1}` })));
    render(<NotificationBanner />);
    await screen.findByText(/Tutor 1 on/);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("And 2 more. Dismiss these to see them.")).toBeInTheDocument();
  });

  it("shows a message if the notices cannot be loaded", async () => {
    server.use(http.get(URL_, () => HttpResponse.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 })));
    render(<NotificationBanner />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("keeps the notice and says why when dismissing fails", async () => {
    serveInbox([makeNotification({ tutor_name: "Maya Chen" })]);
    server.use(http.patch(`${URL_}/:id`, () => HttpResponse.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 })));
    const user = userEvent.setup();
    render(<NotificationBanner />);
    await user.click(await screen.findByRole("button", { name: /dismiss/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByText(/Maya Chen/)).toBeInTheDocument();
  });
});
