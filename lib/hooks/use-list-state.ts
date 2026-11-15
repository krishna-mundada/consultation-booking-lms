"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  parseListState,
  toSearchParams,
  withChange,
  type ListChange,
  type ListDefaults,
  type ListState,
} from "@/lib/list-state";

/**
 * The state of a list, kept in the page's URL (ADR 0007, A22). Reading is `state`; changing it with
 * `update` writes the URL, which re-renders with the new state. `replace`, not `push`: typing in a search
 * box should not fill the history with one entry per keystroke. Needs a <Suspense> boundary above it
 * (reading the URL's search parameters is a request-time read).
 *
 * `defaults` must be a stable object (declare it at module level).
 */
export function useListState(defaults: ListDefaults): { state: ListState; update: (change: ListChange) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const state = useMemo(() => parseListState(new URLSearchParams(search.toString()), defaults), [search, defaults]);

  const update = useCallback(
    (change: ListChange) => {
      const next = toSearchParams(withChange(state, change), defaults).toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [router, pathname, state, defaults],
  );

  return { state, update };
}
