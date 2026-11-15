import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiActor } from "../support/api";
import type { ListSpec } from "@/lib/api/list-query";
import { ADMIN_LIST, STUDENT_LIST, TUTOR_SESSIONS_LIST } from "@/lib/services/consultations";
import { NOTIFICATION_LIST } from "@/lib/services/notifications";
import { PEOPLE_LIST } from "@/lib/services/people";
import { TUTOR_PICKER_LIST } from "@/lib/services/tutors";
import type { TestRole } from "../support/supabase";

// One contract for every list endpoint (ADR 0007, A23): page[number], page[size], sort,
// filter[field][op], filter[q], and the same envelope and the same refusals. The endpoints are
// driven from the same ListSpec objects the handlers use, so a sort or a filter that is declared
// but does not work against the real database fails here.

const ENDPOINTS: { path: string; role: TestRole; spec: ListSpec }[] = [
  { path: "/api/consultations", role: "student", spec: STUDENT_LIST },
  { path: "/api/tutor/sessions", role: "tutor", spec: TUTOR_SESSIONS_LIST },
  { path: "/api/admin/consultations", role: "admin", spec: ADMIN_LIST },
  { path: "/api/admin/people", role: "admin", spec: PEOPLE_LIST },
  { path: "/api/notifications", role: "student", spec: NOTIFICATION_LIST },
  { path: "/api/tutors", role: "student", spec: TUTOR_PICKER_LIST },
];

const refused = async (api: APIRequestContext, url: string) => {
  const res = await api.get(url);
  expect(res.status(), url).toBe(400);
  const body = await res.json();
  expect(body.error.code, url).toBe("VALIDATION_ERROR");
  expect(Object.keys(body.error.details.fields).length, url).toBeGreaterThan(0);
  return body;
};

for (const { path, role, spec } of ENDPOINTS) {
  test.describe(`list convention: ${path}`, () => {
    test("answers in the shared envelope, with the default page size, and is never cached", async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!, role);
      const res = await api.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()["cache-control"]).toContain("no-store");
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
      expect(Object.keys(body.meta.page).sort()).toEqual(["number", "size", "total", "total_pages"]);
      expect(body.meta.page.number).toBe(1);
      expect(body.meta.page.size).toBe(spec.defaultPageSize ?? 20);
      expect(body.meta.page.total_pages).toBeGreaterThanOrEqual(1);
    });

    test("honours page[size] and page[number], and a page past the end is empty, not an error", async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!, role);
      const small = await (await api.get(`${path}?page[size]=1`)).json();
      expect(small.meta.page.size).toBe(1);
      expect(small.data.length).toBeLessThanOrEqual(1);

      const beyond = await api.get(`${path}?page[size]=100&page[number]=1000`);
      expect(beyond.status()).toBe(200);
      const body = await beyond.json();
      expect(body.data).toEqual([]);
      expect(body.meta.page.number).toBe(1000);
    });

    for (const name of Object.keys(spec.sorts)) {
      test(`sorts by ${name}, ascending and descending`, async ({ baseURL }) => {
        const { api } = await apiActor(baseURL!, role);
        for (const sort of [name, `-${name}`]) {
          const res = await api.get(`${path}?sort=${sort}`);
          expect(res.status(), sort).toBe(200);
        }
      });
    }

    test("searches with filter[q], including text full of wildcard and quoting characters", async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!, role);
      if (!spec.search?.length) {
        await refused(api, `${path}?filter[q]=anything`);
        return;
      }
      for (const q of ["a", "%25", "_", "a,b", "(x)", '"quoted"', "back\\slash", "*", "x".repeat(100)]) {
        const res = await api.get(`${path}?filter[q]=${encodeURIComponent(q)}`);
        expect(res.status(), q).toBe(200);
      }
      await refused(api, `${path}?filter[q]=${"x".repeat(101)}`);
    });

    for (const [name, def] of Object.entries(spec.filters ?? {})) {
      test(`filters by ${name}: ops ${def.ops.join(", ")}`, async ({ baseURL }) => {
        const { api } = await apiActor(baseURL!, role);
        const sample = sampleFor(def.kind);
        for (const op of def.ops) {
          const value = op === "in" ? `${sample},${sample}` : sample;
          const res = await api.get(`${path}?filter[${name}][${op}]=${encodeURIComponent(value)}`);
          expect(res.status(), `${name} ${op}`).toBe(200);
        }
        // An operator this filter does not offer, and a value of the wrong kind, are refused.
        const missing = (["eq", "in", "gte", "lte"] as const).find((op) => !def.ops.includes(op));
        if (missing) await refused(api, `${path}?filter[${name}][${missing}]=${sample}`);
        await refused(api, `${path}?filter[${name}][${def.ops[0]}]=${encodeURIComponent("not-a-valid-value!")}`);
      });
    }

    // One parser serves every list, so what it refuses is proven once (here and in tests/unit/list-query.test.ts),
    // not six times. Each endpoint above proves what is its own: that its declared sorts, filters and search work.
    if (path === ENDPOINTS[0].path) {
      test("refuses what it does not recognise, with a 400 that names the problem", async ({ baseURL }) => {
        const { api } = await apiActor(baseURL!, role);
        const known = Object.keys(spec.sorts)[0];
        const cases = [
          "page[number]=0",
          "page[number]=1001",
          "page[number]=1.5",
          "page[number]=abc",
          "page[number]=-1",
          "page[size]=0",
          "page[size]=101",
          "page[size]=abc",
          "page[number]=1&page[number]=2",
          "page[size]=5&page[size]=6",
          "page=2",
          "page_size=5",
          "limit=5",
          "offset=5",
          "sort=nonsense",
          "sort=-nonsense",
          "sort=",
          `sort=${known},${known}`,
          "filter[nonsense][eq]=x",
          "filter[nonsense]=x",
          "filter[q][eq]=x",
          "filter=x",
          "filter[][eq]=x",
          "foo=bar",
          "page[]=1",
          "constructor=x",
          "toString=x",
          "filter[__proto__][eq]=x",
        ];
        for (const query of cases) await refused(api, `${path}?${query}`);
      });

      test("a refusal lists what is allowed", async ({ baseURL }) => {
        const { api } = await apiActor(baseURL!, role);
        const body = await refused(api, `${path}?sort=nonsense`);
        const text = JSON.stringify(body.error.details.fields);
        for (const name of Object.keys(spec.sorts)) expect(text).toContain(name);
      });

      test("never answers 500 to hostile query strings", async ({ baseURL }) => {
        const { api } = await apiActor(baseURL!, role);
        const nasty = [
          "page[number]=%00",
          "page[number]=9007199254740993",
          "sort=%00",
          "sort=" + "a,".repeat(500),
          "filter[q]=%00",
          "filter[q]=%ff%fe",
          "filter[x][eq]=" + "1".repeat(5000),
          "a=" + "b".repeat(20_000),
          // Next.js drops a bare __proto__ key before the handler sees it; the parser's own handling of it
          // is covered in tests/unit/list-query.test.ts. Either way it must not be a 500.
          "__proto__=x",
          "filter[__proto__][eq]=x",
          "%",
          "&&&&",
          "=",
        ];
        for (const query of nasty) {
          const res = await api.get(`${path}?${query}`);
          expect(res.status(), query.slice(0, 40)).toBeLessThan(500);
        }
      });
    }
  });
}

function sampleFor(kind: { kind: string; values?: readonly string[] }): string {
  switch (kind.kind) {
    case "enum":
      return kind.values![0];
    case "uuid":
      return "3f2b8c1e-5d4a-4e2b-9c1a-7a6b5c4d3e2f";
    case "instant":
      return "2030-01-01T00:00:00Z";
    default:
      throw new Error(`no sample for filter kind ${kind.kind}`);
  }
}
