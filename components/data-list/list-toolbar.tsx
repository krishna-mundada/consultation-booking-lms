"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ListChange, ListState } from "@/lib/list-state";
import { MAX_SEARCH_LENGTH } from "@/lib/list-state";

type ChoiceOption = { value: string; label: string };

/** A set of mutually exclusive filter buttons. The option with value "" means "no filter". */
export type FilterGroup = { name: string; label: string; options: readonly ChoiceOption[] };

type ListToolbarProps = {
  state: ListState;
  onChange: (change: ListChange) => void;
  searchLabel: string;
  searchPlaceholder?: string;
  filters?: readonly FilterGroup[];
  /** When given, a "Sort by" menu is shown (for lists that have no sortable column headings). */
  sortOptions?: readonly ChoiceOption[];
};

/** How long to wait after the last keystroke before searching. */
const SEARCH_DELAY_MS = 300;

/** Search, filters and sorting for a server-side list. It only edits the list state; it never fetches. */
export function ListToolbar({ state, onChange, searchLabel, searchPlaceholder, filters = [], sortOptions }: ListToolbarProps) {
  const [text, setText] = useState(state.q);
  const [seenQ, setSeenQ] = useState(state.q);
  const searchId = useId();
  const sortId = useId();

  // Follow the URL when it changes from outside (the back button, a link). Done while rendering, which is
  // React's way to reset state from a changed value without an effect.
  if (state.q !== seenQ) {
    setSeenQ(state.q);
    setText(state.q);
  }

  // Search once typing pauses, not on every keystroke.
  useEffect(() => {
    const next = text.trim();
    if (next === state.q) return;
    const timer = setTimeout(() => onChange({ q: next }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, state.q, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 max-w-md flex-1">
          <label htmlFor={searchId} className="sr-only">
            {searchLabel}
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={searchId}
            type="search"
            value={text}
            maxLength={MAX_SEARCH_LENGTH}
            placeholder={searchPlaceholder}
            className="pl-9"
            onChange={(event) => setText(event.target.value)}
          />
        </div>

        {sortOptions && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span id={sortId}>Sort by</span>
            <Select value={state.sort} onValueChange={(sort) => onChange({ sort })}>
              <SelectTrigger aria-labelledby={sortId} className="w-44 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {filters.map((group) => (
        <div key={group.name} role="group" aria-label={group.label} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground" aria-hidden="true">
            {group.label}
          </span>
          {group.options.map((option) => {
            const selected = (state.filters[group.name] ?? "") === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                onClick={() => onChange({ filters: { [group.name]: option.value } })}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
