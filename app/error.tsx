"use client";

import Link from "next/link";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

// Shown when something throws while a page renders. The error itself is never printed: its text
// can carry internals. `error.digest` ties this screen to the server log if support is needed.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPage
      title="Something went wrong"
      description={`The page could not be shown. Try again, and if it keeps happening, quote ${error.digest ?? "this time"} to support.`}
    >
      <Button onClick={reset}>Try again</Button>
      <Button asChild variant="outline">
        <Link href={ROUTES.dashboard}>Back to the app</Link>
      </Button>
    </StatusPage>
  );
}
