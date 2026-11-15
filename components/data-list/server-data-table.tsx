"use client";

import type { ReactNode } from "react";
import { useListScreen } from "@/lib/hooks/use-list-screen";
import { isNarrowed, type ListDefaults } from "@/lib/list-state";
import type { Page } from "@/lib/schemas/api";
import { DataTable, type Column } from "./data-table";
import { LoadStateView } from "./load-state-view";
import { ListToolbar, type FilterGroup } from "./list-toolbar";
import { Pager } from "./pager";

type ServerDataTableProps<T> = {
  /** Stable: declare at module level. */
  defaults: ListDefaults;
  /** Stable: one of the API client's functions. */
  fetcher: (query: string) => Promise<Page<T>>;
  /** The columns; given `reload` so a cell that changes something can refresh the table. */
  columns: (reload: () => void) => readonly Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  searchLabel: string;
  searchPlaceholder?: string;
  filters?: readonly FilterGroup[];
  /** What to say when there is nothing at all, and what to say when a search or filter matched nothing. */
  empty: { none: ReactNode; noMatch: ReactNode };
  /** Words for the count above the table, such as "consultations". */
  noun: { one: string; other: string };
};

/**
 * A data table backed by the server: search, filters, sorting and paging all live in the URL and are done
 * by the API (ADR 0007, A22, A23), so it stays fast however many rows there are. The three admin and
 * tutor tables are this component with different columns.
 */
export function ServerDataTable<T>({
  defaults,
  fetcher,
  columns,
  rowKey,
  caption,
  searchLabel,
  searchPlaceholder,
  filters,
  empty,
  noun,
}: ServerDataTableProps<T>) {
  const { state, update, list } = useListScreen(defaults, fetcher);

  const narrowed = isNarrowed(state, defaults);

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        state={state}
        onChange={update}
        searchLabel={searchLabel}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
      />
      <LoadStateView status={list.status} error={list.error} onRetry={list.retry}>
        <p role="status" className="text-sm text-muted-foreground">
          {list.total} {list.total === 1 ? noun.one : noun.other}
          {narrowed ? " match" + (list.total === 1 ? "es" : "") : ""}
        </p>
        <DataTable
          caption={caption}
          columns={columns(list.reload)}
          rows={list.items}
          rowKey={rowKey}
          sort={state.sort}
          onSort={(sort) => update({ sort })}
          empty={narrowed ? empty.noMatch : empty.none}
          busy={list.fetching}
        />
        <Pager
          page={state.page}
          size={state.size}
          total={list.total}
          totalPages={list.totalPages}
          onPage={(page) => update({ page })}
          onSize={(size) => update({ size })}
        />
      </LoadStateView>
    </div>
  );
}
