import { MAX_PAGE } from "@/lib/schemas/consultation";

// The state of a table or list: which page, how many rows, what order, what search text and which
// filters. It lives in the page's URL (ADR 0007, A22) so a refresh, the back button and a shared link all
// keep the view. The URL is user input: anything the screen did not offer falls back to the default. The
// server validates everything again (lib/api/list-query.ts); this keeps a hand-edited URL from reaching it.

/** The page sizes the screens offer. */
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const MAX_SEARCH_LENGTH = 100;

export type ListState = {
  page: number;
  size: number;
  /** A sort name, with a leading "-" for descending. */
  sort: string;
  q: string;
  /** Filter name to value. An absent name is "no filter". */
  filters: Record<string, string>;
};

/** What a screen offers: the starting point, and the only sorts and filter values it understands. */
export type ListDefaults = {
  size: number;
  sort: string;
  sorts: readonly string[];
  filters: Readonly<Record<string, readonly string[]>>;
  /**
   * A filter that starts on a value (a tutor's list opens on "upcoming"). The URL then says nothing for
   * that value, and "all" is how it says "no filter". The filter must list "all" among its values.
   */
  initial?: Readonly<Record<string, string>>;
};

/** The filter value that means "no filter" for a filter that has a starting value. */
export const ALL = "all";

const WHOLE_NUMBER = /^\d+$/;

function whole(value: string | null): number | null {
  return value !== null && WHOLE_NUMBER.test(value) ? Number(value) : null;
}

export function parseListState(params: URLSearchParams, defaults: ListDefaults): ListState {
  const page = whole(params.get("page"));
  const size = whole(params.get("size"));
  const sort = params.get("sort") ?? "";
  const name = sort.startsWith("-") ? sort.slice(1) : sort;

  const filters: Record<string, string> = {};
  for (const [filter, allowed] of Object.entries(defaults.filters)) {
    const value = params.get(filter);
    if (value !== null && allowed.includes(value)) filters[filter] = value;
    else if (defaults.initial?.[filter]) filters[filter] = defaults.initial[filter];
  }

  return {
    page: page !== null && page >= 1 && page <= MAX_PAGE ? page : 1,
    size: size !== null && (PAGE_SIZES as readonly number[]).includes(size) ? size : defaults.size,
    sort: defaults.sorts.includes(name) ? sort : defaults.sort,
    q: (params.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    filters,
  };
}

/** The URL parameters for a state, leaving out whatever is the default so a plain view has a plain URL. */
export function toSearchParams(state: ListState, defaults: ListDefaults): URLSearchParams {
  const params = new URLSearchParams();
  if (state.page !== 1) params.set("page", String(state.page));
  if (state.size !== defaults.size) params.set("size", String(state.size));
  if (state.sort !== defaults.sort) params.set("sort", state.sort);
  if (state.q) params.set("q", state.q);
  for (const [name, value] of Object.entries(state.filters)) {
    if (value && value !== defaults.initial?.[name]) params.set(name, value);
  }
  return params;
}

export type ListChange = Partial<Omit<ListState, "filters">> & { filters?: Record<string, string> };

/**
 * A state with a change applied. Anything but a page change starts again from page 1: page 4 of one
 * ordering is not page 4 of another. A filter set to "" is removed; filters not mentioned are kept.
 */
export function withChange(state: ListState, change: ListChange): ListState {
  const filters = { ...state.filters, ...change.filters };
  for (const name of Object.keys(filters)) if (!filters[name]) delete filters[name];

  const next: ListState = { ...state, ...change, filters };
  const onlyPage = Object.keys(change).length === 1 && change.page !== undefined;
  return onlyPage ? next : { ...next, page: change.page ?? 1 };
}

/** The query string the API expects (ADR 0007, A23). */
export function toApiQuery(state: ListState): string {
  const params = new URLSearchParams();
  params.set("page[number]", String(state.page));
  params.set("page[size]", String(state.size));
  params.set("sort", state.sort);
  if (state.q) params.set("filter[q]", state.q);
  for (const [name, value] of Object.entries(state.filters)) {
    if (value && value !== ALL) params.set(`filter[${name}]`, value);
  }
  return params.toString();
}

/**
 * True when the user has narrowed the list with a search or a filter. "All" is not a limit, and neither is
 * a filter still on its starting value (a tutor's list starts on "upcoming"): the user has not chosen it.
 */
export function isNarrowed(state: ListState, defaults?: Pick<ListDefaults, "initial">): boolean {
  if (state.q !== "") return true;
  return Object.entries(state.filters).some(
    ([name, value]) => value !== "" && value !== ALL && value !== defaults?.initial?.[name],
  );
}
