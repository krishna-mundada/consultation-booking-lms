import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: string;
  /** The API sort name. Leave out for a column that cannot be sorted. */
  sort?: string;
  cell: (row: T) => ReactNode;
  /** Classes for the column's cells (width, wrapping, hiding on narrow screens). */
  className?: string;
};

type DataTableProps<T> = {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** The current sort, as in the URL: a name, with a leading "-" for descending. */
  sort: string;
  onSort: (sort: string) => void;
  /** Shown instead of rows when there are none. */
  empty: ReactNode;
  /** A request is in flight: the rows on screen are about to change. */
  busy?: boolean;
};

const nextSort = (current: string, name: string) => (current === name ? `-${name}` : name);

/**
 * A table whose sorting is done by the server: the column headings only say which ordering to ask for.
 * Free text wraps anywhere instead of stretching the table, so a long value cannot push a column off screen.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, sort, onSort, empty, busy }: DataTableProps<T>) {
  const sorted = sort.startsWith("-") ? sort.slice(1) : sort;
  const descending = sort.startsWith("-");

  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-card shadow-sm transition-opacity", busy && "opacity-70")} aria-busy={busy}>
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {columns.map((column) => {
              const active = column.sort === sorted;
              return (
                <TableHead
                  key={column.id}
                  scope="col"
                  className={column.className}
                  aria-sort={column.sort && active ? (descending ? "descending" : "ascending") : undefined}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(nextSort(sort, column.sort!))}
                      className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {column.header}
                      {active ? (
                        descending ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn("align-top", column.className)}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
