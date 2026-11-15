import { z } from "zod";
import { ValidationError, type FieldErrors } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import type { Page } from "@/lib/schemas/api";
import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE } from "@/lib/schemas/consultation";

// One query convention for every list endpoint (ADR 0007, A23), modelled on JSON:API and on the
// filter / orderBy / connection conventions of GraphQL:
//
//   page[number]=2&page[size]=25      paging, with the totals reported in `meta`
//   sort=-scheduled_at,tutor_name     a comma list; a leading - is descending
//   filter[status]=scheduled          equality; filter[x][in]=a,b a list; [gte] and [lte] ranges
//   filter[q]=text                    free-text search over the fields the resource names
//
// Each resource declares what it allows in a ListSpec; this one parser validates against it and one
// applier turns the result into a database query. Whatever is not declared is a 400 that lists what is
// allowed. Nothing a client sends is ever used as a column name or part of a query expression.

/** A descending sort: a leading "-". */
export const desc = (sort: string): string => `-${sort}`;

type Operator = "eq" | "in" | "gte" | "lte";

type FilterKind =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "uuid" }
  | { kind: "instant" };

/** The slice of the query builder the applier uses. Cast once, at the edge, from the real builder. */
type Chainable = {
  eq(column: string, value: string): Chainable;
  in(column: string, values: string[]): Chainable;
  gte(column: string, value: string): Chainable;
  lte(column: string, value: string): Chainable;
  lt(column: string, value: string): Chainable;
  is(column: string, value: null): Chainable;
  not(column: string, operator: string, value: null): Chainable;
  or(filters: string): Chainable;
  order(column: string, options: { ascending: boolean }): Chainable;
};

export type FilterDef = {
  column: string;
  kind: FilterKind;
  ops: readonly Operator[];
  /** For a filter that is not a plain comparison on one column (e.g. "upcoming"). */
  apply?: (query: Chainable, value: string, now: Date) => Chainable;
};

export type ListSpec = {
  /** Public sort name to column. */
  sorts: Record<string, string>;
  /** A sort expression such as "-scheduled_at". */
  defaultSort: string;
  filters: Record<string, FilterDef>;
  /** Columns that filter[q] searches. Omit for a resource with no search. */
  search?: readonly string[];
  defaultPageSize?: number;
  maxPageSize?: number;
};

type ParsedSort = { name: string; column: string; desc: boolean };
type ParsedFilter = { name: string; column: string; op: Operator; value: string | string[] };
export type ParsedList = {
  page: number;
  pageSize: number;
  sort: ParsedSort[];
  filters: ParsedFilter[];
  /** The sanitised search text, or null. */
  q: string | null;
};

const MAX_SORT_FIELDS = 3;
const MAX_IN_VALUES = 20;
const MAX_SEARCH_LENGTH = 100;
const FILTER_KEY = /^filter\[([a-z_]+)\](?:\[([a-z]+)\])?$/;
const UNSIGNED_INTEGER = /^\d+$/;
// Characters that mean something in a search expression or a LIKE pattern. The search text is data:
// they become spaces, so they can neither break the expression nor act as wildcards.
// Also every control character: Postgres cannot store NUL in text, so passing it on would be a 500.
const SEARCH_SPECIAL = /[,()"*%_\\\u0000-\u001f\u007f]/g;

const uuid = z.guid();
const instant = z.iso.datetime({ offset: true });

function parseSort(
  spec: ListSpec,
  expression: string,
  problem: (key: string, message: string) => void,
): ParsedSort[] {
  const names = expression.split(",");
  const sorts: ParsedSort[] = [];
  if (names.length > MAX_SORT_FIELDS) {
    problem("sort", `Sort by at most ${MAX_SORT_FIELDS} fields`);
    return sorts;
  }
  for (const part of names) {
    const desc = part.startsWith("-");
    const name = desc ? part.slice(1) : part;
    const column = Object.hasOwn(spec.sorts, name) ? spec.sorts[name] : undefined;
    if (!column) {
      problem("sort", `Cannot sort by "${name}". Allowed: ${Object.keys(spec.sorts).join(", ")}`);
    } else if (sorts.some((s) => s.name === name)) {
      problem("sort", `"${name}" is given more than once`);
    } else {
      sorts.push({ name, column, desc });
    }
  }
  return sorts;
}

function validValue(kind: FilterKind, value: string): boolean {
  switch (kind.kind) {
    case "enum":
      return kind.values.includes(value);
    case "uuid":
      return uuid.safeParse(value).success;
    case "instant":
      return instant.safeParse(value).success;
  }
}

/** Validates a query string against a ListSpec. Throws a ValidationError naming every problem. */
export function parseListQuery(spec: ListSpec, params: URLSearchParams): ParsedList {
  // A Map, not a plain object: a parameter named "__proto__" must be an ordinary key.
  const found = new Map<string, string[]>();
  const problem = (key: string, message: string) => found.set(key, [...(found.get(key) ?? []), message]);

  const defaultSize = spec.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxSize = spec.maxPageSize ?? MAX_PAGE_SIZE;
  let page = 1;
  let pageSize = defaultSize;
  let sort = parseSort(spec, spec.defaultSort, () => {});
  let q: string | null = null;
  const filters: ParsedFilter[] = [];

  const values = new Map<string, string[]>();
  for (const [key, value] of params.entries()) values.set(key, [...(values.get(key) ?? []), value]);

  for (const [key, given] of values) {
    if (given.length > 1) {
      problem(key, "Given more than once");
      continue;
    }
    const value = given[0];

    if (key === "page[number]") {
      const n = UNSIGNED_INTEGER.test(value) ? Number(value) : NaN;
      if (n >= 1 && n <= MAX_PAGE) page = n;
      else problem(key, `Must be a whole number from 1 to ${MAX_PAGE}`);
    } else if (key === "page[size]") {
      const n = UNSIGNED_INTEGER.test(value) ? Number(value) : NaN;
      if (n >= 1 && n <= maxSize) pageSize = n;
      else problem(key, `Must be a whole number from 1 to ${maxSize}`);
    } else if (key === "sort") {
      sort = parseSort(spec, value, problem);
    } else {
      const match = FILTER_KEY.exec(key);
      if (!match) {
        problem(key, MESSAGES.unknownParameter);
        continue;
      }
      const [, name, operator] = match;

      if (name === "q") {
        const text = value.replace(SEARCH_SPECIAL, " ").replace(/\s+/g, " ").trim();
        if (!spec.search) problem(key, "This list cannot be searched");
        else if (operator !== undefined) problem(key, "filter[q] takes no operator");
        else if (value.length > MAX_SEARCH_LENGTH) problem(key, `At most ${MAX_SEARCH_LENGTH} characters`);
        else q = text === "" ? null : text;
        continue;
      }

      const def = Object.hasOwn(spec.filters, name) ? spec.filters[name] : undefined;
      if (!def) {
        const allowed = [...Object.keys(spec.filters), ...(spec.search ? ["q"] : [])].join(", ");
        problem(key, `Cannot filter by "${name}". Allowed: ${allowed}`);
        continue;
      }
      const op = (operator ?? "eq") as Operator;
      if (!def.ops.includes(op)) {
        problem(key, `"${name}" does not support "${op}". Allowed: ${def.ops.join(", ")}`);
        continue;
      }

      if (op === "in") {
        const list = value.split(",");
        if (list.length > MAX_IN_VALUES) problem(key, `At most ${MAX_IN_VALUES} values`);
        else if (list.some((item) => !validValue(def.kind, item))) problem(key, "Contains a value that is not valid");
        else filters.push({ name, column: def.column, op, value: list });
      } else if (!validValue(def.kind, value)) {
        problem(key, "Not a valid value");
      } else {
        filters.push({ name, column: def.column, op, value });
      }
    }
  }

  if (found.size > 0) throw new ValidationError(MESSAGES.invalidRequest, Object.fromEntries(found) as FieldErrors);
  return { page, pageSize, sort, filters, q };
}

/** Adds the filters, the search and the ordering to a query. `tieBreak` makes the order stable across pages. */
export function applyListQuery<B>(
  builder: B,
  parsed: ParsedList,
  spec: ListSpec,
  tieBreak = "id",
  now: Date = new Date(),
): B {
  let query = builder as unknown as Chainable;

  for (const filter of parsed.filters) {
    const def = spec.filters[filter.name];
    if (def.apply && typeof filter.value === "string") {
      query = def.apply(query, filter.value, now);
      continue;
    }
    if (filter.op === "in") query = query.in(filter.column, filter.value as string[]);
    else if (filter.op === "gte") query = query.gte(filter.column, filter.value as string);
    else if (filter.op === "lte") query = query.lte(filter.column, filter.value as string);
    else query = query.eq(filter.column, filter.value as string);
  }

  if (parsed.q && spec.search) {
    // The text was sanitised by the parser, so it cannot end the expression or add a wildcard.
    query = query.or(spec.search.map((column) => `${column}.ilike.*${parsed.q}*`).join(","));
  }

  for (const sort of parsed.sort) query = query.order(sort.column, { ascending: !sort.desc });
  query = query.order(tieBreak, { ascending: true });
  return query as unknown as B;
}

/** The rows a page covers, for `.range()`. */
export function pageRange(parsed: Pick<ParsedList, "page" | "pageSize">) {
  return { from: (parsed.page - 1) * parsed.pageSize, to: parsed.page * parsed.pageSize - 1 };
}

/** A page of results with its paging details. A list with no rows still has one (empty) page. */
export function pageOf<T>(data: T[], parsed: Pick<ParsedList, "page" | "pageSize">, total: number): Page<T> {
  return {
    data,
    meta: {
      page: {
        number: parsed.page,
        size: parsed.pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / parsed.pageSize)),
      },
    },
  };
}
