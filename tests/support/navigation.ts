import { useMemo, useSyncExternalStore } from "react";
import { vi } from "vitest";

// A stand-in for next/navigation in jsdom: the URL's search string lives here, `router.replace` writes it,
// and useSearchParams re-renders whoever reads it, like the real thing. A test sets the starting URL with
// `navigation.set("role=tutor")` and reads what the screen wrote with `navigation.search`.

let search = "";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const navigation = {
  pathname: "/test",
  /** Every URL `router.replace` was called with, in order. */
  replaced: [] as string[],
  get search() {
    return search;
  },
  set(next: string) {
    search = next;
    listeners.forEach((listener) => listener());
  },
  reset() {
    search = "";
    navigation.replaced = [];
  },
};

const write = (url: string) => {
  navigation.replaced.push(url);
  navigation.set(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
};

export const navigationModule = {
  useRouter: () => ({ replace: write, push: write, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => {
    const current = useSyncExternalStore(subscribe, () => search, () => search);
    // Stable until the URL changes, as in Next.js.
    return useMemo(() => new URLSearchParams(current), [current]);
  },
  redirect: vi.fn(),
  notFound: vi.fn(),
};
