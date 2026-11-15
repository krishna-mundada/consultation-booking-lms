"use client";

import { useEffect } from "react";
import { hardNavigate } from "@/lib/hard-navigate";
import { ROUTES } from "@/lib/routes";

/**
 * When the server says the session has ended, send the user to the login screen with a full
 * page load. Leaving them on a page that only shows an error would strand them with a stale
 * header (and, for a moment, the previous user's data) on screen.
 */
export function useSessionGuard(sessionExpired: boolean) {
  useEffect(() => {
    if (sessionExpired) hardNavigate(ROUTES.login);
  }, [sessionExpired]);
}
