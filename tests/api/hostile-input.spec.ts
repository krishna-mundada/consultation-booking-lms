import { expect, test } from "@playwright/test";
import { apiActor } from "../support/api";
import { createTutor, uniqueSlot } from "../support/supabase";

// Input a well-behaved client never sends. The rule: the API answers with a clean 4xx and the
// standard error body, never a 500, never a hang, and nothing is stored that should not be.


// Every test books with its own tutor, so tests running side by side never fight over a slot.
let TUTOR_ID = "";
test.beforeEach(async () => {
  TUTOR_ID = (await createTutor()).id;
});

const valid = () => ({
  tutor_id: TUTOR_ID,
  reason: "Exam prep",
  scheduled_at: uniqueSlot(),
});

test.describe("request bodies of the wrong shape", () => {
  // Built per test: the tutor only exists once the test has started.
  const bodies = (): [string, unknown][] => [
    ["an array", [valid()]],
    ["a string", "hello"],
    ["null", null],
    ["a number", 42],
    ["an empty object", {}],
    ["a tutor that is an array", { ...valid(), tutor_id: [TUTOR_ID] }],
    ["a tutor that is an object", { ...valid(), tutor_id: { $ne: "" } }],
    ["a tutor that is a number", { ...valid(), tutor_id: 12345 }],
    ["a tutor that looks like SQL", { ...valid(), tutor_id: "' OR 1=1 --" }],
    ["a boolean reason", { ...valid(), reason: true }],
    ["a numeric datetime", { ...valid(), scheduled_at: 1893456000000 }],
    ["a datetime that is not a date", { ...valid(), scheduled_at: "next tuesday" }],
    ["a date with no time zone", { ...valid(), scheduled_at: "2099-01-01T09:00" }],
    ["an enormous year", { ...valid(), scheduled_at: "+275760-09-13T00:00:00.001Z" }],
  ];

  for (const [label] of bodies()) {
    test(`${label} is refused with 400 and the error envelope`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!);
      const data = bodies().find(([name]) => name === label)![1];
      // Sent as explicit JSON: Playwright would send a bare string as plain text.
      const res = await api.post("/api/consultations", {
        headers: { "content-type": "application/json" },
        data: JSON.stringify(data),
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(typeof body.error.message).toBe("string");
      expect(JSON.stringify(body)).not.toMatch(/stack|postgres|supabase|at \w+\.\w+ \(/i);
    });
  }

  test("nothing was stored by any of them", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    for (const [, data] of bodies()) {
      await api.post("/api/consultations", { headers: { "content-type": "application/json" }, data: JSON.stringify(data) });
    }
    expect((await (await api.get("/api/consultations")).json()).meta.page.total).toBe(0);
  });
});

test.describe("text that looks like an attack is stored and returned as plain data", () => {
  const strings = [
    "Robert'); DROP TABLE consultations;--",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "${7*7} {{7*7}} %s %d",
    "../../etc/passwd",
    "  padded  ",
    "emoji 🎓 and RTL ‮evil",
    "line one\nline two",
  ];

  for (const text of strings) {
    test(`${JSON.stringify(text).slice(0, 40)}`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!);
      const res = await api.post("/api/consultations", { data: { ...valid(), reason: text } });
      // Either it is accepted and comes back exactly as sent (trimmed), or it is refused cleanly.
      expect([201, 400]).toContain(res.status());
      if (res.status() === 201) {
        const row = (await res.json()).data;
        expect(row.reason).toBe(text.trim());
        const list = await api.get("/api/consultations");
        expect(list.headers()["content-type"]).toContain("application/json");
        expect(list.headers()["x-content-type-options"]).toBe("nosniff");
      }
      // The table is still there afterwards.
      expect((await api.get("/api/consultations")).status()).toBe(200);
    });
  }

  test("a NUL character, which Postgres cannot store, is a 400 and not a 500", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const res = await api.post("/api/consultations", { data: { ...valid(), reason: "bad\u0000byte" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("sizes", () => {
  test("a body of about 2 MB is refused cleanly", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    const res = await api.post("/api/consultations", { data: { ...valid(), reason: "x".repeat(2_000_000) } });
    expect(res.status()).toBe(400);
  });

  test("a deeply nested body does not crash the parser", async ({ baseURL }) => {
    const { api } = await apiActor(baseURL!);
    let nested: unknown = "x";
    for (let i = 0; i < 2000; i++) nested = { a: nested };
    const res = await api.post("/api/consultations", { data: { ...valid(), reason: nested } });
    expect(res.status()).toBe(400);
  });
});

test.describe("addresses and query strings", () => {
  for (const id of ["not-a-uuid", "%00", "1".repeat(500), "..%2F..%2Fadmin", "' OR 1=1 --", "00000000-0000-0000-0000-00000000000g"]) {
    test(`PATCH with the id ${JSON.stringify(id).slice(0, 30)} is a 400 or 404`, async ({ baseURL }) => {
      const { api } = await apiActor(baseURL!);
      const res = await api.patch(`/api/consultations/${id}`, { data: { action: "cancel" } });
      expect([400, 404]).toContain(res.status());
    });
  }
});
