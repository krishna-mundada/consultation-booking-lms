import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type Column } from "@/components/data-list/data-table";

// A server-sorted table: the headings say which ordering to ask for, and mark the one in force.

type Row = { id: string; name: string; role: string };
const rows: Row[] = [
  { id: "1", name: "Ada", role: "tutor" },
  { id: "2", name: "Bob", role: "student" },
];
const columns: Column<Row>[] = [
  { id: "name", header: "Name", sort: "name", cell: (r) => r.name },
  { id: "role", header: "Role", cell: (r) => r.role },
];

function setup(over: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const onSort = vi.fn();
  render(
    <DataTable
      caption="People"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      sort="name"
      onSort={onSort}
      empty="Nothing here"
      {...over}
    />,
  );
  return { onSort, user: userEvent.setup() };
}

describe("DataTable", () => {
  it("renders a captioned table with a row per item", () => {
    setup();
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // heading row + 2
    expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
  });

  it("marks the sorted column ascending or descending, and leaves the others unmarked", () => {
    setup({ sort: "name" });
    expect(screen.getByRole("columnheader", { name: /name/i })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /role/i })).not.toHaveAttribute("aria-sort");
  });

  it("reports descending for a leading minus", () => {
    setup({ sort: "-name" });
    expect(screen.getByRole("columnheader", { name: /name/i })).toHaveAttribute("aria-sort", "descending");
  });

  it("asks for the opposite order when the sorted heading is clicked", async () => {
    const { onSort, user } = setup({ sort: "name" });
    await user.click(within(screen.getByRole("columnheader", { name: /name/i })).getByRole("button"));
    expect(onSort).toHaveBeenCalledWith("-name");
  });

  it("asks for ascending when an unsorted heading is clicked, and descending sorted goes back to ascending", async () => {
    const sortable: Column<Row>[] = [...columns, { id: "x", header: "Other", sort: "other", cell: () => "" }];
    const { onSort, user } = setup({ columns: sortable, sort: "-name" });
    await user.click(screen.getByRole("button", { name: /other/i }));
    expect(onSort).toHaveBeenLastCalledWith("other");
    await user.click(screen.getByRole("button", { name: /name/i }));
    expect(onSort).toHaveBeenLastCalledWith("name");
  });

  it("has no button on a column that cannot be sorted", () => {
    setup();
    expect(within(screen.getByRole("columnheader", { name: /role/i })).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the empty message, spanning the table, when there are no rows", () => {
    setup({ rows: [] });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });
});
