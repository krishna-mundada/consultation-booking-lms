"use client";

import { useCallback, useEffect, useState } from "react";
import type { Page } from "@/lib/schemas/api";
import { toApiQuery, type ListState } from "@/lib/list-state";
import { describeError, isSessionExpired } from "./outcome";

export const LOAD_STATE = { loading: "loading", ready: "ready", error: "error" } as const;
export type LoadState = (typeof LOAD_STATE)[keyof typeof LOAD_STATE];

type Settled = { key: string; error: string | null; sessionExpired: boolean };

/**
 * One page of a server-side list (ADR 0007, A22, A23) for the state in the URL. Changing the state loads
 * again; the rows already on screen stay until the new ones arrive, so paging and typing in the search
 * box do not flash an empty table. `reload` loads the same page again after a change.
 *
 * `fetcher` must be a stable function (the API client's), not one made on each render.
 */
export function useServerList<T>(fetcher: (query: string) => Promise<Page<T>>, state: ListState) {
  // The last page that arrived, and how the most recent request ended. Everything else is derived from
  // these and the current request, so no state is set synchronously inside the effect.
  const [data, setData] = useState<Page<T> | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const query = toApiQuery(state);
  const key = `${reloadKey}|${query}`;

  useEffect(() => {
    // A newer request (or unmounting) supersedes this one: ignore its late response.
    let ignore = false;
    fetcher(query).then(
      (page) => {
        if (ignore) return;
        setData(page);
        setSettled({ key, error: null, sessionExpired: false });
      },
      (failure: unknown) => {
        if (ignore) return;
        setSettled({ key, error: describeError(failure).message, sessionExpired: isSessionExpired(failure) });
      },
    );
    return () => {
      ignore = true;
    };
  }, [fetcher, query, key]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  const status: LoadState = settled === null ? LOAD_STATE.loading : settled.error ? LOAD_STATE.error : LOAD_STATE.ready;

  return {
    items: data?.data ?? [],
    total: data?.meta.page.total ?? 0,
    totalPages: data?.meta.page.total_pages ?? 1,
    status,
    /** True while a request is in flight, including when rows from the last one are still shown. */
    fetching: settled?.key !== key,
    error: settled?.error ?? null,
    sessionExpired: settled?.sessionExpired ?? false,
    reload,
    /** Load again after a failed load, showing the loading state meanwhile. */
    retry: () => {
      setSettled(null);
      reload();
    },
  };
}
