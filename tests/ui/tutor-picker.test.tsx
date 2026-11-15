import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { TutorPicker } from "@/components/features/consultations/tutor-picker";
import type { Tutor } from "@/lib/schemas/consultation";
import { API, mockApi } from "../support/msw";
import { errorBody, listBody, makeTutor } from "../support/fixtures";

// Choosing a tutor (ADR 0007, A16): a dropdown with a search box over a scrolling list of matches, searched
// on the server (the standard combobox pattern).

const server = mockApi();
const maya = makeTutor({ display_name: "Maya Chen" });
const jordan = makeTutor({ display_name: "Jordan Reyes" });

const serveTutors = (all: Tutor[], total = all.length) => {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/api/tutors`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const q = params.get("filter[q]") ?? "";
      const matches = all.filter((t) => t.display_name.toLowerCase().includes(q.toLowerCase()));
      return HttpResponse.json(listBody(matches, { total: q ? undefined : total }));
    }),
  );
  return requests;
};

function setup(value: Tutor | null = null, error?: string) {
  const onChange = vi.fn();
  render(<TutorPicker value={value} onChange={onChange} error={error} />);
  return { onChange, user: userEvent.setup() };
}

const trigger = () => screen.getByRole("combobox", { name: "Tutor" });
const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(trigger());

describe("the closed dropdown", () => {
  it("asks to choose a tutor, and says nothing is fetched until it is opened", () => {
    const requests = serveTutors([maya]);
    setup();
    expect(trigger()).toHaveTextContent("Choose a tutor");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(requests).toHaveLength(0);
  });

  it("shows the chosen tutor's name", () => {
    serveTutors([maya]);
    setup(maya);
    expect(trigger()).toHaveTextContent("Maya Chen");
  });

  it("shows an error the form passes in, tied to the dropdown", () => {
    serveTutors([maya]);
    setup(null, "Choose a tutor from the list");
    expect(trigger()).toHaveAccessibleDescription("Choose a tutor from the list");
  });
});

describe("the open dropdown", () => {
  it("lists tutors as options, by name, with a search box", async () => {
    serveTutors([maya, jordan]);
    const { user } = setup();
    await open(user);
    expect(await screen.findByRole("option", { name: "Maya Chen" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Jordan Reyes" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Tutors" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search tutors by name" })).toHaveFocus();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("asks for one page of matches, sorted by name, not every tutor", async () => {
    const requests = serveTutors([maya, jordan]);
    const { user } = setup();
    await open(user);
    await screen.findByRole("option", { name: "Maya Chen" });
    expect(Object.fromEntries(requests[0])).toEqual({ "page[number]": "1", "page[size]": "20", sort: "display_name" });
  });

  it("reports the tutor that was chosen and closes", async () => {
    serveTutors([maya, jordan]);
    const { onChange, user } = setup();
    await open(user);
    await user.click(await screen.findByRole("option", { name: "Jordan Reyes" }));
    expect(onChange).toHaveBeenCalledWith(jordan);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("marks the chosen tutor in the list", async () => {
    serveTutors([maya, jordan]);
    const { user } = setup(maya);
    await open(user);
    expect(await screen.findByRole("option", { name: "Maya Chen" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Jordan Reyes" })).toHaveAttribute("aria-selected", "false");
  });

  it("searches on the server as the student types, and shows only the matches", async () => {
    const requests = serveTutors([maya, jordan]);
    const { user } = setup();
    await open(user);
    await screen.findByRole("option", { name: "Maya Chen" });

    await user.type(screen.getByRole("searchbox", { name: "Search tutors by name" }), "jor");
    await waitFor(() => expect(screen.queryByRole("option", { name: "Maya Chen" })).not.toBeInTheDocument());
    expect(screen.getByRole("option", { name: "Jordan Reyes" })).toBeInTheDocument();
    expect(requests.at(-1)?.get("filter[q]")).toBe("jor");
  });

  it("works from the keyboard: arrow keys move, Enter chooses, and Enter does not submit a form", async () => {
    serveTutors([maya, jordan]);
    const submitted = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <form onSubmit={submitted}>
        <TutorPicker value={null} onChange={onChange} />
      </form>,
    );
    await open(user);
    await screen.findByRole("option", { name: "Maya Chen" });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(jordan); // the list opens on the first option; one ArrowDown is the second
    expect(submitted).not.toHaveBeenCalled();
  });

  it("says so when no tutor has that name", async () => {
    serveTutors([maya]);
    const { user } = setup();
    await open(user);
    await screen.findByRole("option", { name: "Maya Chen" });
    await user.type(screen.getByRole("searchbox", { name: "Search tutors by name" }), "zzz");
    expect(await screen.findByText("No tutor has that name.")).toBeInTheDocument();
  });

  it("says so when there are no tutors at all", async () => {
    serveTutors([]);
    const { user } = setup();
    await open(user);
    expect(await screen.findByText("There are no tutors to book yet.")).toBeInTheDocument();
  });

  it("tells the student the list is only part of the tutors when there are more", async () => {
    serveTutors([maya, jordan], 100);
    const { user } = setup();
    await open(user);
    expect(await screen.findByText("Showing 2 of 100. Type to narrow the list.")).toBeInTheDocument();
  });

  it("shows the error with a way to try again", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/tutors`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 })
          : HttpResponse.json(listBody([maya]));
      }),
    );
    const { user } = setup();
    await open(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("option", { name: "Maya Chen" })).toBeInTheDocument();
  });
});
