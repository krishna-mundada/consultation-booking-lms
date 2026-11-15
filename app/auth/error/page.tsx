import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Link problem" };

// Fixed text on purpose: echoing `?error=` would let anyone craft a link that shows a message of
// their choosing on our domain.
export default function Page() {
  return (
    <div className="flex w-full flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Sorry, something went wrong.</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              That link is invalid or has expired. Please try again.
            </p>
            <Link href={ROUTES.login} className="text-sm underline underline-offset-4">
              Back to login
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
