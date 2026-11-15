import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusPage title="Page not found" description="That address does not lead anywhere. It may have moved, or been mistyped.">
      <Button asChild>
        <Link href={ROUTES.dashboard}>Back to the app</Link>
      </Button>
    </StatusPage>
  );
}
