import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { PeopleTable } from "@/components/features/people/people-table";
import type { Person } from "@/lib/schemas/people";
import { API, mockApi } from "../support/msw";
import { errorBody, listBody, makePerson } from "../support/fixtures";
import { navigation } from "../support/navigation";

// The admin's People screen (ADR 0007, A4, A5, A8, A21, A22): a server-side table with one control, the
// tutor switch. The URL holds the table's state; the API does the searching, sorting and filtering.

const server = mockApi();
const LIST = `${API}/api/admin/people`;

const sam = makePerson({ display_name: "Sam Taylor", email: "sam@example.com", role: "student" });
const maya = makePerson({ display_name: "Maya Chen", email: "maya@example.com", role: "tutor", upcoming: 0 });
const jordan = makePerson({ display_name: "Jordan Reyes", email: "jordan@example.com", role: "tutor", upcoming: 2 });
const alex = makePerson({ display_name: "Alex Morgan", email: "alex@example.com", role: "admin" });

function serve(people: Person[] = [sam, maya, jordan, alex]) {
  const requests: URLSearchParams[] = [];
  const patches: { id: string; body: unknown }[] = [];
  server.use(
    http.get(LIST, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(listBody(people, { size: 20 }));
    }),
  );
  return { requests, patches };
}

function servePatch(result: { role: string; upcoming: number; cancelled: number }, status = 200, error?: object) {
  const patches: { id: string; body: unknown }[] = [];
  server.use(
    http.patch(`${LIST}/:id`, async ({ params, request }) => {
      patches.push({ id: String(params.id), body: await request.json() });
      return error ? HttpResponse.json(error, { status }) : HttpResponse.json({ data: result });
    }),
  );
  return patches;
}

async function ready() {
  await screen.findByRole("cell", { name: "Sam Taylor" });
}

const switchFor = (name: string) => screen.getByRole("switch", { name: `Tutor: ${name}` });

describe("the table", () => {
  it("shows name, email, role and upcoming for everyone, with the count above", async () => {
    serve();
    render(<PeopleTable />);
    await ready();
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Maya Chen/ });
    expect(within(row).getByText("maya@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Tutor")).toBeInTheDocument();
    expect(screen.getByText("4 people")).toBeInTheDocument();
  });

  it("gives every student and tutor a switch that shows whether they are a tutor", async () => {
    serve();
    render(<PeopleTable />);
    await ready();
    expect(switchFor("Sam Taylor")).not.toBeChecked();
    expect(switchFor("Maya Chen")).toBeChecked();
  });

  it("gives an admin no switch at all: they cannot be changed here", async () => {
    serve();
    render(<PeopleTable />);
    await ready();
    expect(screen.queryByRole("switch", { name: /Alex Morgan/ })).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Alex Morgan/ });
    expect(within(row).getAllByText("Admin").length).toBeGreaterThan(0);
  });

  it("starts by name, 20 to a page, with nothing filtered", async () => {
    const { requests } = serve();
    render(<PeopleTable />);
    await ready();
    expect(Object.fromEntries(requests[0])).toEqual({ "page[number]": "1", "page[size]": "20", sort: "name" });
    expect(navigation.replaced).toEqual([]);
  });

  it("says nobody has signed up when the table is empty", async () => {
    serve([]);
    render(<PeopleTable />);
    expect(await screen.findByText("No one has signed up yet.")).toBeInTheDocument();
  });

  it("shows the message when the list cannot be loaded, with a way to try again", async () => {
    server.use(http.get(LIST, () => HttpResponse.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 })));
    render(<PeopleTable />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("search, filter and sort live in the URL and are done by the API", () => {
  it("opens on the view the URL describes", async () => {
    const { requests } = serve();
    navigation.set("role=tutor&q=maya&sort=-email&page=2&size=50");
    render(<PeopleTable />);
    await ready();
    expect(Object.fromEntries(requests[0])).toEqual({
      "page[number]": "2",
      "page[size]": "50",
      sort: "-email",
      "filter[q]": "maya",
      "filter[role]": "tutor",
    });
    expect(screen.getByRole("button", { name: "Tutors" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters by role: writes the URL and asks the API, starting again from page 1", async () => {
    const { requests } = serve();
    navigation.set("page=3");
    const user = userEvent.setup();
    render(<PeopleTable />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Students" }));
    await waitFor(() => expect(requests.length).toBe(2));
    expect(navigation.search).toBe("role=student");
    expect(requests[1].get("filter[role]")).toBe("student");
    expect(requests[1].get("page[number]")).toBe("1");
  });

  it("says no one matches, and how to get back, when a search finds nobody", async () => {
    serve([]);
    navigation.set("q=nobody");
    render(<PeopleTable />);
    expect(await screen.findByText(/No one matches/)).toBeInTheDocument();
  });
});

describe("turning someone into a tutor", () => {
  it("promotes a student, says so, and loads the table again", async () => {
    const { requests } = serve();
    const patches = servePatch({ role: "tutor", upcoming: 0, cancelled: 0 });
    const user = userEvent.setup();
    render(<PeopleTable />);
    await ready();
    await user.click(switchFor("Sam Taylor"));
    expect(await screen.findByText("Sam Taylor is now a tutor and can be booked.")).toBeInTheDocument();
    expect(patches).toEqual([{ id: sam.id, body: { tutor: true } }]);
    await waitFor(() => expect(requests.length).toBe(2));
  });

  it("turns off a tutor with nothing coming up straight away, with no question", async () => {
    serve();
    const patches = servePatch({ role: "student", upcoming: 0, cancelled: 0 });
    const user = userEvent.setup();
    render(<PeopleTable />);
    await ready();
    await user.click(switchFor("Maya Chen"));
    expect(await screen.findByText("Maya Chen is no longer a tutor.")).toBeInTheDocument();
    expect(patches).toEqual([{ id: maya.id, body: { tutor: false } }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the server's message under the switch when the change is refused", async () => {
    serve();
    servePatch({ role: "tutor", upcoming: 0, cancelled: 0 }, 403, errorBody("FORBIDDEN", "Forbidden"));
    const user = userEvent.setup();
    render(<PeopleTable />);
    await ready();
    await user.click(switchFor("Sam Taylor"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    expect(switchFor("Sam Taylor")).not.toBeChecked(); // it never showed something that did not happen
  });
});

describe("turning off a tutor who has upcoming consultations (A8)", () => {
  async function openDialog() {
    serve();
    const user = userEvent.setup();
    render(<PeopleTable />);
    await ready();
    await user.click(switchFor("Jordan Reyes"));
    const dialog = await screen.findByRole("dialog");
    return { user, dialog };
  }

  it("asks first, says how many are coming up, and changes nothing yet", async () => {
    const patches = servePatch({ role: "student", upcoming: 2, cancelled: 2 });
    const { dialog } = await openDialog();
    expect(dialog).toHaveTextContent("Turn off Jordan Reyes as a tutor?");
    expect(dialog).toHaveTextContent("Jordan Reyes has 2 upcoming consultations.");
    expect(patches).toEqual([]);
    // The page behind a modal is hidden from assistive technology, hence `hidden`.
    expect(screen.getByRole("switch", { name: "Tutor: Jordan Reyes", hidden: true })).toBeChecked();
  });

  it("offers cancel and notify, keep, and go back", async () => {
    const { dialog } = await openDialog();
    expect(within(dialog).getByRole("button", { name: "Cancel them and notify" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Keep them" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });

  it("cancels them and notifies the students when told to, and reports what happened", async () => {
    const patches = servePatch({ role: "student", upcoming: 2, cancelled: 2 });
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Cancel them and notify" }));
    expect(
      await screen.findByText("Jordan Reyes is no longer a tutor. 2 upcoming consultations were cancelled and the students notified."),
    ).toBeInTheDocument();
    expect(patches).toEqual([{ id: jordan.id, body: { tutor: false, cancel_upcoming: true } }]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps them when told to, and says so", async () => {
    const patches = servePatch({ role: "student", upcoming: 2, cancelled: 0 });
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Keep them" }));
    expect(await screen.findByText("Jordan Reyes is no longer a tutor. Their upcoming consultations were kept.")).toBeInTheDocument();
    expect(patches).toEqual([{ id: jordan.id, body: { tutor: false, cancel_upcoming: false } }]);
  });

  it("does nothing at all on Go back", async () => {
    const patches = servePatch({ role: "student", upcoming: 2, cancelled: 2 });
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(patches).toEqual([]);
    expect(switchFor("Jordan Reyes")).toBeChecked();
  });

  it("opens the same question when the server says the tutor has upcoming consultations after all (a 409)", async () => {
    // The table showed none (Maya: 0), but someone booked her since the table loaded.
    serve();
    servePatch({ role: "tutor", upcoming: 0, cancelled: 0 }, 409, errorBody("CONFLICT", "This tutor has upcoming consultations"));
    const user = userEvent.setup();
    render(<PeopleTable />);
    await ready();
    await user.click(switchFor("Maya Chen"));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Turn off Maya Chen as a tutor?");
  });
});
