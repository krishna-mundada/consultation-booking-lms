"use client";

import type { ListDefaults } from "@/lib/list-state";
import type { Page } from "@/lib/schemas/api";
import { useListState } from "./use-list-state";
import { useServerList } from "./use-server-list";
import { useSessionGuard } from "./use-session-guard";

/**
 * Everything a list screen needs, wired the same way each time: the state in the URL, the page that state asks the
 * server for, and a trip to the sign-in page if the session has ended. The table screens and the student's
 * cards both start here; they differ only in how they draw the rows.
 *
 * `defaults` must be a stable object (declare it at module level) and `fetcher` a stable function.
 */
export function useListScreen<T>(defaults: ListDefaults, fetcher: (query: string) => Promise<Page<T>>) {
  const { state, update } = useListState(defaults);
  const list = useServerList(fetcher, state);
  useSessionGuard(list.sessionExpired);
  return { state, update, list };
}
