"use client";

import { useMemo } from "react";
import { useHydrated } from "./use-hydrated";

/**
 * The time when the page became interactive, or null before that. Anything that depends on the time
 * (which days can still be booked) must not be drawn on the server: it would be a different answer by the
 * time the browser takes over. The server decides what is really allowed.
 */
export function useNow(): Date | null {
  const hydrated = useHydrated();
  return useMemo(() => (hydrated ? new Date() : null), [hydrated]);
}
