"use client";

import { useSyncExternalStore } from "react";

/** For values that never change after mount: there is nothing to subscribe to. */
const subscribeNever = () => () => {};

/**
 * `false` on the server and while the page is hydrating, `true` once it is interactive on the
 * client. Use it to hold back anything that must not run before then: a submit button (a native
 * form submission before hydration would lose the user's input) or UI that depends on browser
 * state such as the theme. Built on useSyncExternalStore so it needs no effect and no extra render.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
