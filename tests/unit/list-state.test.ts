import { describe, expect, it } from "vitest";
import {
  isNarrowed,
  parseListState,
  toApiQuery,
  toSearchParams,
  withChange,
  type ListDefaults,
  type ListState,
} from "@/lib/list-state";

// The state of a table lives in the page's URL (ADR 0007, A22): a refresh, the back button and a shared link
// all keep the same view. The URL is user input, so anything unexpected falls back to the default.

const defaults: ListDefaults = {
  size: 20,
  sort: "-scheduled_at",
  sorts: ["scheduled_at", "tutor_name", "status"],
  filters: { status: ["scheduled", "cancelled"], when: ["upcoming", "past"] },
};

const parse = (query: string) => parseListState(new URLSearchParams(query), defaults);

describe("parseListState", () => {
  it("is the defaults for an empty URL", () => {
    expect(parse("")).toEqual({ page: 1, size: 20, sort: "-scheduled_at", q: "", filters: {} });
  });

  it("reads page, size, sort, search and filters", () => {
    expect(parse("page=3&size=50&sort=tutor_name&q=maths&status=cancelled&when=past")).toEqual({
      page: 3,
      size: 50,
      sort: "tutor_name",
      q: "maths",
      filters: { status: "cancelled", when: "past" },
    });
  });

  it("accepts a descending sort of a known field", () => {
    expect(parse("sort=-status").sort).toBe("-status");
  });

  it.each([
    ["page=0", 1],
    ["page=-4", 1],
    ["page=1.5", 1],
    ["page=abc", 1],
    ["page=1001", 1],
    ["page=%00", 1],
  ])("ignores a bad page (%s)", (query, expected) => {
    expect(parse(query).page).toBe(expected);
  });

  it.each(["size=0", "size=7", "size=1000", "size=abc"])("ignores a size that is not offered (%s)", (query) => {
    expect(parse(query).size).toBe(20);
  });

  it.each(["sort=nonsense", "sort=-nonsense", "sort=", "sort=scheduled_at,tutor_name", "sort=__proto__"])(
    "ignores a sort that is not offered (%s)",
    (query) => {
      expect(parse(query).sort).toBe("-scheduled_at");
    },
  );

  it("ignores a filter value that is not offered, and filters it does not know", () => {
    expect(parse("status=weird&nonsense=1&when=upcoming").filters).toEqual({ when: "upcoming" });
  });

  it("trims the search and limits it to 100 characters", () => {
    expect(parse("q=%20%20exam%20prep%20").q).toBe("exam prep");
    expect(parse(`q=${"x".repeat(150)}`).q).toHaveLength(100);
  });

  it("takes the first of a repeated parameter", () => {
    expect(parse("page=2&page=3").page).toBe(2);
  });
});

describe("toSearchParams", () => {
  it("leaves out everything that is the default, so a plain view has a plain URL", () => {
    const state: ListState = { page: 1, size: 20, sort: "-scheduled_at", q: "", filters: {} };
    expect(toSearchParams(state, defaults).toString()).toBe("");
  });

  it("writes what differs, and parses back to the same state", () => {
    const state: ListState = { page: 2, size: 50, sort: "status", q: "a b", filters: { when: "past" } };
    const written = toSearchParams(state, defaults);
    expect(parseListState(written, defaults)).toEqual(state);
  });
});

describe("withChange", () => {
  const base: ListState = { page: 4, size: 20, sort: "-scheduled_at", q: "", filters: {} };

  it("goes back to page 1 when the sort, search, size or a filter changes", () => {
    expect(withChange(base, { sort: "status" }).page).toBe(1);
    expect(withChange(base, { q: "x" }).page).toBe(1);
    expect(withChange(base, { size: 50 }).page).toBe(1);
    expect(withChange(base, { filters: { when: "past" } }).page).toBe(1);
  });

  it("keeps the page when only the page changes", () => {
    expect(withChange(base, { page: 5 }).page).toBe(5);
  });

  it("clears a filter when it is set to the empty string", () => {
    const withFilter = { ...base, filters: { when: "past", status: "scheduled" } };
    expect(withChange(withFilter, { filters: { when: "" } }).filters).toEqual({ status: "scheduled" });
  });

  it("merges filters rather than replacing them", () => {
    const withFilter = { ...base, filters: { when: "past" } };
    expect(withChange(withFilter, { filters: { status: "cancelled" } }).filters).toEqual({
      when: "past",
      status: "cancelled",
    });
  });
});

describe("toApiQuery", () => {
  it("writes the API's own convention (ADR 0007, A23)", () => {
    const state: ListState = { page: 2, size: 50, sort: "-status", q: "a b", filters: { when: "past" } };
    const query = new URLSearchParams(toApiQuery(state));
    expect(query.get("page[number]")).toBe("2");
    expect(query.get("page[size]")).toBe("50");
    expect(query.get("sort")).toBe("-status");
    expect(query.get("filter[q]")).toBe("a b");
    expect(query.get("filter[when]")).toBe("past");
  });

  it("leaves out an empty search and an empty filter set", () => {
    const query = new URLSearchParams(toApiQuery({ page: 1, size: 20, sort: "name", q: "", filters: {} }));
    expect([...query.keys()].sort()).toEqual(["page[number]", "page[size]", "sort"]);
  });

  it("encodes what could break a query string", () => {
    const text = toApiQuery({ page: 1, size: 20, sort: "name", q: "a&b=c#d", filters: {} });
    expect(new URLSearchParams(text).get("filter[q]")).toBe("a&b=c#d");
  });
});

describe("a filter with a starting value (e.g. a tutor's list opens on upcoming sessions)", () => {
  const withInitial: ListDefaults = {
    ...defaults,
    filters: { ...defaults.filters, when: ["upcoming", "past", "all"] },
    initial: { when: "upcoming" },
  };
  const read = (query: string) => parseListState(new URLSearchParams(query), withInitial);

  it("uses the starting value when the URL says nothing", () => {
    expect(read("").filters).toEqual({ when: "upcoming" });
  });

  it("lets the URL choose another value, or 'all' to see everything", () => {
    expect(read("when=past").filters).toEqual({ when: "past" });
    expect(read("when=all").filters).toEqual({ when: "all" });
  });

  it("falls back to the starting value for a value that is not offered", () => {
    expect(read("when=weird").filters).toEqual({ when: "upcoming" });
  });

  it("leaves the starting value out of the URL, and writes 'all' because it differs from it", () => {
    expect(toSearchParams(read(""), withInitial).toString()).toBe("");
    expect(toSearchParams(read("when=all"), withInitial).toString()).toBe("when=all");
    expect(toSearchParams(read("when=past"), withInitial).toString()).toBe("when=past");
  });

  it("does not send 'all' to the API: it means no filter", () => {
    const query = new URLSearchParams(toApiQuery(read("when=all")));
    expect(query.has("filter[when]")).toBe(false);
    expect(new URLSearchParams(toApiQuery(read(""))).get("filter[when]")).toBe("upcoming");
  });
});

describe("isNarrowed: whether a search or a filter is limiting the list", () => {
  const state = (over: Partial<ListState>): ListState => ({ page: 1, size: 20, sort: "x", q: "", filters: {}, ...over });

  it("is false for no search and no filter, and for a filter set to 'all'", () => {
    expect(isNarrowed(state({}))).toBe(false);
    expect(isNarrowed(state({ filters: { when: "all" } }))).toBe(false);
  });

  it("is true for a search or a real filter", () => {
    expect(isNarrowed(state({ q: "x" }))).toBe(true);
    expect(isNarrowed(state({ filters: { when: "past" } }))).toBe(true);
  });

  it("does not count a filter that is still on its starting value: the user has not narrowed anything", () => {
    const withInitial: ListDefaults = { ...defaults, initial: { when: "upcoming" } };
    expect(isNarrowed(state({ filters: { when: "upcoming" } }), withInitial)).toBe(false);
    expect(isNarrowed(state({ filters: { when: "past" } }), withInitial)).toBe(true);
    expect(isNarrowed(state({ q: "x", filters: { when: "upcoming" } }), withInitial)).toBe(true);
  });
});
