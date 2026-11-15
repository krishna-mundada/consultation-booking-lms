"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/utils";

// The pieces every authentication screen is made of, so login, sign-up and the two password forms look and
// behave the same and none of them repeats the markup.

/** A card with a title and a description, around a form. */
export function AuthCard({
  title,
  description,
  className,
  children,
  ...props
}: { title: ReactNode; description: ReactNode; children: ReactNode } & Omit<ComponentProps<"div">, "title">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

/**
 * The form. `method="post"` is the second line of defence: if a browser ever submits it natively, the
 * values travel in the request body and never end up in the URL, history or server logs.
 */
export function AuthForm({
  onSubmit,
  footer,
  children,
}: {
  onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} method="post">
      <div className="flex flex-col gap-6">{children}</div>
      {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
    </form>
  );
}

/** A labelled input. `labelAside` sits at the right of the label (the "forgot your password?" link). */
export function AuthField({
  id,
  label,
  labelAside,
  ...inputProps
}: { id: string; label: string; labelAside?: ReactNode } & Omit<ComponentProps<typeof Input>, "id">) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <Input id={id} {...inputProps} />
    </div>
  );
}

/**
 * The submit button. It stays disabled until the page is interactive: before that there is no submit handler, and
 * a native submit would put the credentials in the URL.
 */
export function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  const hydrated = useHydrated();
  return (
    <Button type="submit" className="w-full" disabled={busy || !hydrated}>
      {busy ? busyLabel : label}
    </Button>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-4">
      {children}
    </Link>
  );
}
