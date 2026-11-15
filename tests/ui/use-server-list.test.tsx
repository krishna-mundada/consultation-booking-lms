import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { consultationsApi } from "@/lib/api/client";
import { useServerList } from "@/lib/hooks/use-server-list";
import type { ListState } from "@/lib/list-state";
import { API, mockApi } from "../support/msw";
import { errorBody, listBody, makeConsultation } from "../support/fixtures";

// The hook's contract with the API (ADR 0007, A22, A23), against a mock server.

const server = mockApi();
const URL_ = `${API}/api/consultations`;
const state: ListState = { page: 1, size: 20, sort: "scheduled_at", q: "", filters: {} };

const render = (initial: ListState = state) =>
  renderHook(({ s }) => useServerList(consultationsApi.list, s), { initialProps: { s: initial } });

describe("loading", () => {
  it("asks the API for the state in the URL's own convention, and exposes the page and the totals", async () => {
    const items = [makeConsultation(), makeConsultation()];
    let requested = new URLSearchParams();
    server.use(
      http.get(URL_, ({ request }) => {
        requested = new URL(request.url).searchParams;
        return HttpResponse.json(listBody(items, { total: 45, size: 20 }));
      }),
    );

    const { result } = render({ page: 2, size: 20, sort: "-status", q: "maths", filters: { when: "past" } });
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(Object.fromEntries(requested)).toEqual({
      "page[number]": "2",
      "page[size]": "20",
      sort: "-status",
      "filter[q]": "maths",
      "filter[when]": "past",
    });
    expect(result.current.items).toEqual(items);
    expect(result.current.total).toBe(45);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.fetching).toBe(false);
  });

  it("surfaces the API's message when loading fails", async () => {
    server.use(http.get(URL_, () => HttpResponse.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 })));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Something went wrong");
    expect(result.current.sessionExpired).toBe(false);
  });

  it("flags an ended session (401) so the screen can send the user to sign in", async () => {
    server.use(http.get(URL_, () => HttpResponse.json(errorBody("UNAUTHENTICATED", "Not authenticated"), { status: 401 })));
    const { result } = render();
    await waitFor(() => expect(result.current.sessionExpired).toBe(true));
  });

  it("shows loading again while a retry is in flight, then the data", async () => {
    let calls = 0;
    server.use(
      http.get(URL_, async () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json(errorBody("INTERNAL", "Something went wrong"), { status: 500 });
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json(listBody([makeConsultation()]));
      }),
    );
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toHaveLength(1);
  });

  it("treats a response in the wrong shape as an error, not as data", async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ data: "nonsense" })));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});

describe("changing the state", () => {
  it("keeps the rows on screen until the next page arrives (no empty flash while paging)", async () => {
    const first = [makeConsultation({ reason: "page one" })];
    const second = [makeConsultation({ reason: "page two" })];
    server.use(
      http.get(URL_, async ({ request }) => {
        const page = new URL(request.url).searchParams.get("page[number]");
        if (page === "2") await new Promise((resolve) => setTimeout(resolve, 40));
        return HttpResponse.json(listBody(page === "2" ? second : first, { total: 40 }));
      }),
    );

    const { result, rerender } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ s: { ...state, page: 2 } });
    await waitFor(() => expect(result.current.fetching).toBe(true));
    expect(result.current.items[0].reason).toBe("page one");
    expect(result.current.status).toBe("ready");

    await waitFor(() => expect(result.current.fetching).toBe(false));
    expect(result.current.items[0].reason).toBe("page two");
  });

  it("ignores a late answer to an older request", async () => {
    server.use(
      http.get(URL_, async ({ request }) => {
        const q = new URL(request.url).searchParams.get("filter[q]");
        if (q === "slow") await new Promise((resolve) => setTimeout(resolve, 80));
        return HttpResponse.json(listBody([makeConsultation({ reason: q ?? "all" })]));
      }),
    );
    const { result, rerender } = render({ ...state, q: "slow" });
    rerender({ s: { ...state, q: "fast" } });
    await waitFor(() => expect(result.current.items[0]?.reason).toBe("fast"));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(result.current.items[0].reason).toBe("fast");
  });

  it("loads the same page again on reload (after a change)", async () => {
    let calls = 0;
    server.use(
      http.get(URL_, () => {
        calls += 1;
        return HttpResponse.json(listBody([makeConsultation({ reason: `call ${calls}` })]));
      }),
    );
    const { result } = render();
    await waitFor(() => expect(result.current.items[0]?.reason).toBe("call 1"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items[0]?.reason).toBe("call 2"));
  });
});
