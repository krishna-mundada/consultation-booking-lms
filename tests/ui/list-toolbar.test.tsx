import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListToolbar, type FilterGroup } from "@/components/data-list/list-toolbar";
import { choose } from "../support/ui";
import type { ListState } from "@/lib/list-state";

const base: ListState = { page: 3, size: 20, sort: "name", q: "", filters: {} };
const filters: FilterGroup[] = [
  {
    name: "role",
    label: "Show",
    options: [
      { value: "", label: "Everyone" },
      { value: "tutor", label: "Tutors" },
    ],
  },
];

function setup(state: Partial<ListState> = {}, props: Partial<Parameters<typeof ListToolbar>[0]> = {}) {
  const onChange = vi.fn();
  const view = render(
    <ListToolbar state={{ ...base, ...state }} onChange={onChange} searchLabel="Search people" filters={filters} {...props} />,
  );
  return { onChange, ...view };
}

describe("search", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const type = (text: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Search people" }), { target: { value: text } });

  it("waits for typing to pause, then searches once", () => {
    const { onChange } = setup();
    type("m");
    act(() => vi.advanceTimersByTime(200));
    type("ma");
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: "ma" });
  });

  it("trims the text and does nothing when it is the same as the current search", () => {
    const { onChange } = setup({ q: "maya" });
    type("  maya  ");
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the search when the box is emptied", () => {
    const { onChange } = setup({ q: "maya" });
    type("");
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenCalledWith({ q: "" });
  });

  it("shows the search from the URL, and follows it when the URL changes", () => {
    const { rerender, onChange } = setup({ q: "maya" });
    expect(screen.getByRole("searchbox", { name: "Search people" })).toHaveValue("maya");
    rerender(<ListToolbar state={{ ...base, q: "" }} onChange={onChange} searchLabel="Search people" filters={filters} />);
    expect(screen.getByRole("searchbox", { name: "Search people" })).toHaveValue("");
  });
});

describe("filters", () => {
  it("marks the chosen option pressed, and 'no filter' when none is set", () => {
    setup({ filters: { role: "tutor" } });
    expect(screen.getByRole("button", { name: "Tutors" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute("aria-pressed", "false");
  });

  it("treats a missing filter as the option with the empty value", () => {
    setup();
    expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks for the chosen value, and for none with the empty one", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ filters: { role: "tutor" } });
    await user.click(screen.getByRole("button", { name: "Everyone" }));
    expect(onChange).toHaveBeenCalledWith({ filters: { role: "" } });
  });
});

describe("sort menu", () => {
  const sortOptions = [
    { value: "name", label: "Name A to Z" },
    { value: "-name", label: "Name Z to A" },
  ];

  it("is shown only when sort options are given", () => {
    setup();
    expect(screen.queryByRole("combobox", { name: /sort by/i })).not.toBeInTheDocument();
  });

  it("shows the current sort and asks for another", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({}, { sortOptions });
    expect(screen.getByRole("combobox", { name: /sort by/i })).toHaveTextContent("Name A to Z");
    await choose(user, /sort by/i, "Name Z to A");
    expect(onChange).toHaveBeenCalledWith({ sort: "-name" });
  });
});
