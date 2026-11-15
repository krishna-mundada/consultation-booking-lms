import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pager } from "@/components/data-list/pager";
import { choose } from "../support/ui";

function setup(over: Partial<Parameters<typeof Pager>[0]> = {}) {
  const onPage = vi.fn();
  const onSize = vi.fn();
  render(<Pager page={2} size={20} total={87} totalPages={5} onPage={onPage} onSize={onSize} {...over} />);
  return { onPage, onSize, user: userEvent.setup() };
}

describe("Pager", () => {
  it("says which rows are shown, and which page this is", () => {
    setup();
    expect(screen.getByText("Showing 21 to 40 of 87")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("clips the last page to the total", () => {
    setup({ page: 5 });
    expect(screen.getByText("Showing 81 to 87 of 87")).toBeInTheDocument();
  });

  it("goes to the previous and the next page", async () => {
    const { onPage, user } = setup();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPage).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenLastCalledWith(3);
  });

  it("cannot go before the first or after the last page", () => {
    setup({ page: 1 });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables Next on the last page", () => {
    setup({ page: 5 });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("offers the page sizes and reports the choice as a number", async () => {
    const { onSize, user } = setup();
    await choose(user, /rows per page/i, "50");
    expect(onSize).toHaveBeenCalledWith(50);
  });

  it("explains a page past the end instead of saying 'Showing 101 to 87'", () => {
    setup({ page: 9, total: 87, totalPages: 5 });
    expect(screen.getByText("No results on page 9")).toBeInTheDocument();
  });

  it("renders nothing when there are no results at all", () => {
    setup({ total: 0, totalPages: 1, page: 1 });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
