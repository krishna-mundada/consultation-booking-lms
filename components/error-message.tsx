import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** An error shown under a form or a list item: announced to screen readers and readable in both themes. */
export function ErrorMessage({ className, ...props }: ComponentProps<"p">) {
  return <p role="alert" className={cn("text-sm text-destructive-text", className)} {...props} />;
}
