"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tutorsApi } from "@/lib/api/client";
import { describeError } from "@/lib/hooks/outcome";
import { toApiQuery } from "@/lib/list-state";
import { TUTOR_SORT, type Tutor } from "@/lib/schemas/consultation";
import { cn } from "@/lib/utils";

const RESULTS = 20;
const SEARCH_DELAY_MS = 250;

type Result = { for: string; tutors: Tutor[]; total: number } | { for: string; error: string };

type TutorPickerProps = {
  value: Tutor | null;
  onChange: (tutor: Tutor) => void;
  error?: string;
};

/**
 * Choose a tutor (ADR 0007, A16): a dropdown with a search box and a scrolling list of matches, the standard
 * combobox pattern. The search runs on the server and only a page of matches is fetched, so it works the same
 * with a handful of tutors or thousands. Focus stays in the search box; the arrow keys move through the list,
 * Enter chooses, Escape closes.
 */
export function TutorPicker({ value, onChange, error }: TutorPickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  // The answer is stored with the search it answers, so a stale answer is never shown as the current one.
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(0);
  const labelId = useId();
  const listId = useId();
  const errorId = useId();
  const query = text.trim();

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    const timer = setTimeout(
      () => {
        tutorsApi.list(toApiQuery({ page: 1, size: RESULTS, sort: TUTOR_SORT.displayName, q: query, filters: {} })).then(
          (page) => {
            if (ignore) return;
            setResult({ for: query, tutors: page.data, total: page.meta.page.total });
            setActive(0);
          },
          (failure: unknown) => !ignore && setResult({ for: query, error: describeError(failure).message }),
        );
      },
      // The first list needs no waiting.
      result === null ? 0 : SEARCH_DELAY_MS,
    );
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
    // `result` is deliberately not a dependency: it only decides whether to wait, and changing it must not search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, attempt]);

  const tutors = result && "tutors" in result ? result.tutors : [];
  const stale = result !== null && result.for !== query;

  function choose(tutor: Tutor) {
    onChange(tutor);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, tutors.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      // Enter in the search box must never submit the booking form.
      event.preventDefault();
      if (tutors[active]) choose(tutors[active]);
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Label id={labelId}>Tutor</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-labelledby={labelId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn("h-9 w-full min-w-0 justify-between px-3 font-normal", !value && "text-muted-foreground")}
          >
            {/* min-w-0: a flex item will not shrink below its text otherwise, and a long name would stretch the form */}
            <span className="min-w-0 truncate">{value ? value.display_name : "Choose a tutor"}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              role="searchbox"
              aria-label="Search tutors by name"
              aria-controls={listId}
              aria-activedescendant={tutors[active] ? `${listId}-${tutors[active].id}` : undefined}
              value={text}
              placeholder="Search tutors by name"
              className="pl-9"
              autoComplete="off"
              autoFocus
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>

          <div aria-live="polite" aria-busy={stale} className={cn("mt-2 transition-opacity", stale && "opacity-60")}>
            {!result && <p className="px-2 py-3 text-sm text-muted-foreground">Loading tutors…</p>}
            {result && "error" in result && (
              <div className="flex flex-wrap items-center gap-2 px-2 py-2">
                <ErrorMessage>{result.error}</ErrorMessage>
                <button type="button" className="text-sm underline underline-offset-4" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              </div>
            )}
            {result && "tutors" in result && result.tutors.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {result.for ? "No tutor has that name." : "There are no tutors to book yet."}
              </p>
            )}
            {result && "tutors" in result && result.tutors.length > 0 && (
              <>
                <ul id={listId} role="listbox" aria-label="Tutors" className="max-h-60 overflow-y-auto">
                  {result.tutors.map((tutor, index) => {
                    const selected = value?.id === tutor.id;
                    return (
                      <li
                        key={tutor.id}
                        id={`${listId}-${tutor.id}`}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(tutor)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm [overflow-wrap:anywhere]",
                          index === active && "bg-accent text-accent-foreground",
                          selected && "font-medium",
                        )}
                      >
                        {tutor.display_name}
                        {selected && <Check className="size-4 shrink-0" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
                {result.total > result.tutors.length && (
                  <p className="px-2 pt-2 text-xs text-muted-foreground">
                    Showing {result.tutors.length} of {result.total}. Type to narrow the list.
                  </p>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
    </div>
  );
}
