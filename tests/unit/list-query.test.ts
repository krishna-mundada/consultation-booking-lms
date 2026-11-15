import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { pageOf, pageRange, parseListQuery, type ListSpec } from "@/lib/api/list-query";

// One query convention for every list (ADR 0007, A23): page[number], page[size], sort=-field,field,
// filter[field] (with [eq|in|gte|lte]) and filter[q]. Anything else is a 400 that says what is allowed.

const spec: ListSpec = {
  sorts: { when: "scheduled_at", tutor: "tutor_name", status: "status" },
  defaultSort: "-when",
  filters: {
    status: { column: "status", kind: { kind: "enum", values: ["scheduled", "cancelled"] }, ops: ["eq", "in"] },
    tutor_id: { column: "tutor_id", kind: { kind: "uuid" }, ops: ["eq", "in"] },
    scheduled_at: { column: "scheduled_at", kind: { kind: "instant" }, ops: ["gte", "lte"] },
  },
  search: ["tutor_name", "reason"],
};

const q = (query: string) => new URLSearchParams(query);

/** The per-parameter messages of the 400 a query produces, or null if it parses. */
function problems(query: string): Record<string, string[]> | null {
  try {
    parseListQuery(spec, q(query));
    return null;
  } catch (error) {
    if (error instanceof ValidationError) return error.details?.fields ?? {};
    throw error;
  }
}

const TUTOR = "3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f";

describe("defaults", () => {
  it("is page 1 of the default size, in the default order, unfiltered", () => {
    const parsed = parseListQuery(spec, q(""));
    expect(parsed).toMatchObject({ page: 1, pageSize: 20, filters: [], q: null });
    expect(parsed.sort).toEqual([{ name: "when", column: "scheduled_at", desc: true }]);
  });
});

describe("paging", () => {
  it("reads page[number] and page[size]", () => {
    expect(parseListQuery(spec, q("page[number]=3&page[size]=50"))).toMatchObject({ page: 3, pageSize: 50 });
  });

  it.each([
    ["page[number]=0"],
    ["page[number]=1.5"],
    ["page[number]=-1"],
    ["page[number]=abc"],
    ["page[number]=1001"],
    ["page[number]=1e3"],
    ["page[number]=0x10"],
    ["page[size]=0"],
    ["page[size]=101"],
    ["page[size]=ten"],
  ])("refuses %s", (query) => {
    expect(problems(query)).not.toBeNull();
  });

  it("names the parameter at fault", () => {
    expect(Object.keys(problems("page[number]=0&page[size]=500")!).sort()).toEqual(["page[number]", "page[size]"]);
  });
});

describe("sorting", () => {
  it("reads a comma list, with - for descending", () => {
    expect(parseListQuery(spec, q("sort=tutor,-when")).sort).toEqual([
      { name: "tutor", column: "tutor_name", desc: false },
      { name: "when", column: "scheduled_at", desc: true },
    ]);
  });

  it("refuses a field that is not allowed and lists the ones that are", () => {
    const result = problems("sort=password")!;
    expect(result.sort[0]).toContain('"password"');
    expect(result.sort[0]).toContain("when, tutor, status");
  });

  it.each([["sort=when,when"], ["sort=when,tutor,status,when"], ["sort=-"], ["sort=when;drop"], ["sort=when,,tutor"]])(
    "refuses %s",
    (query) => {
      expect(problems(query)).not.toBeNull();
    },
  );
});

describe("filtering", () => {
  it("reads eq (the default operator), in, and ranges", () => {
    const parsed = parseListQuery(
      spec,
      q(
        `filter[status]=scheduled&filter[tutor_id][in]=${TUTOR},${TUTOR}&filter[scheduled_at][gte]=2030-01-01T00:00:00Z&filter[scheduled_at][lte]=2030-02-01T00:00:00Z`,
      ),
    );
    expect(parsed.filters).toEqual([
      { name: "status", column: "status", op: "eq", value: "scheduled" },
      { name: "tutor_id", column: "tutor_id", op: "in", value: [TUTOR, TUTOR] },
      { name: "scheduled_at", column: "scheduled_at", op: "gte", value: "2030-01-01T00:00:00Z" },
      { name: "scheduled_at", column: "scheduled_at", op: "lte", value: "2030-02-01T00:00:00Z" },
    ]);
  });

  it("refuses an unknown field and lists the allowed ones, search included", () => {
    const result = problems("filter[password]=x")!;
    expect(result["filter[password]"][0]).toContain("status, tutor_id, scheduled_at, q");
  });

  it("refuses an operator the field does not support", () => {
    expect(problems("filter[status][gte]=a")!["filter[status][gte]"][0]).toContain('"gte"');
    expect(problems("filter[scheduled_at][eq]=2030-01-01T00:00:00Z")).not.toBeNull();
  });

  it.each([
    ["an enum value that does not exist", "filter[status]=archived"],
    ["a uuid that is not one", "filter[tutor_id]=nobody"],
    ["a list containing a bad uuid", `filter[tutor_id][in]=${TUTOR},nobody`],
    ["a date with no zone", "filter[scheduled_at][gte]=2030-01-01T00:00:00"],
    ["a date that is not a date", "filter[scheduled_at][gte]=soon"],
    ["an empty list", "filter[tutor_id][in]="],
    ["more than twenty values", `filter[tutor_id][in]=${Array(21).fill(TUTOR).join(",")}`],
  ])("refuses %s", (_label, query) => {
    expect(problems(query)).not.toBeNull();
  });

  it.each([["filter[status]"], ["filter[status][eq][x]"], ["filter[]=a"], ["filter[Status]=scheduled"]])(
    "refuses the malformed key %s",
    (query) => {
      expect(problems(query)).not.toBeNull();
    },
  );
});

describe("search (filter[q])", () => {
  it("removes control characters, NUL above all: Postgres cannot store it and it would be a 500", () => {
    expect(parseListQuery(spec, q("filter[q]=a%00b")).q).toBe("a b");
    expect(parseListQuery(spec, q("filter[q]=a%01%1f%7fb")).q).toBe("a b");
    expect(parseListQuery(spec, q("filter[q]=%00")).q).toBeNull();
  });

  it("keeps ordinary text, trimmed", () => {
    expect(parseListQuery(spec, q("filter[q]=%20%20exam%20prep%20")).q).toBe("exam prep");
  });

  it("treats characters with a meaning in a search expression as spaces", () => {
    expect(parseListQuery(spec, q('filter[q]=a,b(c)"d*e%f_g\\h')).q).toBe("a b c d e f g h");
  });

  it("ignores an empty search", () => {
    expect(parseListQuery(spec, q("filter[q]=%20%20")).q).toBeNull();
  });

  it("refuses a search longer than 100 characters", () => {
    expect(problems(`filter[q]=${"x".repeat(101)}`)).not.toBeNull();
  });

  it("is refused where the resource has nothing to search", () => {
    expect(() => parseListQuery({ ...spec, search: undefined }, q("filter[q]=x"))).toThrow(ValidationError);
  });
});

describe("anything else", () => {
  it.each([["page=2"], ["limit=5"], ["offset=5"], ["foo=bar"], ["sort[]=when"], ["__proto__=x"]])(
    "refuses the unknown parameter %s",
    (query) => {
      expect(problems(query)).not.toBeNull();
    },
  );

  it.each([["sort=when&sort=tutor"], ["page[number]=1&page[number]=2"], ["filter[status]=scheduled&filter[status]=cancelled"]])(
    "refuses a parameter given twice: %s",
    (query) => {
      expect(problems(query)).not.toBeNull();
    },
  );

  it("says what went wrong in the standard validation error", () => {
    expect(() => parseListQuery(spec, q("foo=bar"))).toThrow(ValidationError);
  });
});

describe("pageRange and pageOf", () => {
  const parsed = parseListQuery(spec, q("page[number]=3&page[size]=10"));

  it("turns a page into a row range", () => {
    expect(pageRange(parsed)).toEqual({ from: 20, to: 29 });
  });

  it("reports the paging details, with at least one page", () => {
    expect(pageOf(["a"], parsed, 21).meta).toEqual({ page: { number: 3, size: 10, total: 21, total_pages: 3 } });
    expect(pageOf([], parsed, 0).meta.page.total_pages).toBe(1);
  });
});
