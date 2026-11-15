"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { hardNavigate } from "@/lib/hard-navigate";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { ROUTES } from "@/lib/routes";

export function LogoutButton() {
  // Disabled until the page is interactive: the button is in the server-rendered HTML before
  // its click handler exists, and a click in that gap would silently do nothing.
  const interactive = useHydrated();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // A full page load, not a client-side route change: the router keeps earlier screens (and
    // their data) alive, so a soft navigation would leave the signed-out user's dashboard
    // reachable with the Back button.
    hardNavigate(ROUTES.login);
  };

  return (
    <Button onClick={logout} disabled={!interactive}>
      Logout
    </Button>
  );
}
