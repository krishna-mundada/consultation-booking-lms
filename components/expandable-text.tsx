"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type ExpandableTextProps = {
  text: string;
  /** Characters shown before the rest is folded away. */
  limit?: number;
  className?: string;
};

/**
 * Free text that can be very long (a reason is up to 1,000 characters): shows the first `limit` characters and
 * a "Read more" button that opens the rest and "Show less" that folds it again. Short text is shown whole.
 */
export function ExpandableText({ text, limit = 140, className }: ExpandableTextProps) {
  const [open, setOpen] = useState(false);
  // By characters a person sees (code points), so an emoji is never cut in half.
  const chars = Array.from(text);
  const long = chars.length > limit;
  const shown = !long || open ? text : `${chars.slice(0, limit).join("").trimEnd()}…`;

  return (
    <span className={cn("[overflow-wrap:anywhere]", className)}>
      {shown}
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="ml-1.5 rounded text-xs font-medium text-primary underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </span>
  );
}
