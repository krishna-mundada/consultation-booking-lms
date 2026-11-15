"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tutorsApi } from "@/lib/api/client";
import {
  SLOT_MINUTES,
  bookableDays,
  formatDayLabel,
  formatSlotTime,
  isSlotBookable,
  slotsForDay,
  zoneAbbreviation,
} from "@/lib/domain/slots";
import { describeError } from "@/lib/hooks/outcome";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

type Availability = { key: string; busy: ReadonlySet<string> } | { key: string; error: string };

type SlotPickerProps = {
  /** Whose time to book. Nothing can be chosen until a tutor is. */
  tutorId: string | null;
  /** The chosen slot (ISO, UTC), or null. */
  value: string | null;
  onChange: (slot: string | null) => void;
  /** Change this to load the tutor's availability again (after the server said a slot was taken). */
  refreshToken?: number;
  error?: string;
  /** Distinguishes the pickers when more than one is on the page. */
  idPrefix?: string;
};

/**
 * A day, then that day's half-hour slots with the tutor's already-booked times and the ones too soon to
 * book switched off (ADR 0007, A11-A14). All times are Australia/Melbourne, with the zone named. This only
 * decides what to offer: the database refuses a double booking however it is reached.
 */
export function SlotPicker({ tutorId, value, onChange, refreshToken = 0, error, idPrefix = "slot" }: SlotPickerProps) {
  const now = useNow();
  const days = useMemo(() => (now ? bookableDays(now) : []), [now]);
  const [day, setDay] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dayId = useId();
  const errorId = useId();

  const slots = useMemo(() => (day ? slotsForDay(day) : []), [day]);
  const key = tutorId && day ? `${tutorId}|${day}|${refreshToken}|${attempt}` : null;

  useEffect(() => {
    if (!key || !tutorId || slots.length === 0) return;
    let ignore = false;
    const from = slots[0];
    const to = new Date(Date.parse(slots[slots.length - 1]) + SLOT_MINUTES * 60_000).toISOString();
    tutorsApi.busy(tutorId, from, to).then(
      (busy) => !ignore && setAvailability({ key, busy: new Set(busy.map((t) => new Date(t).toISOString())) }),
      (failure: unknown) => !ignore && setAvailability({ key, error: describeError(failure).message }),
    );
    return () => {
      ignore = true;
    };
  }, [key, tutorId, slots]);

  // What was loaded for this tutor and day, if anything: an older answer is never shown for a newer choice.
  const loaded = availability && availability.key === key ? availability : null;
  const busy = loaded && "busy" in loaded ? loaded.busy : null;
  const zone = slots[0] ? zoneAbbreviation(slots[0]) : "";

  function chooseDay(next: string) {
    setDay(next);
    onChange(null);
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={dayId}>Day</Label>
        <Select value={day} disabled={!tutorId || !now} onValueChange={chooseDay}>
          <SelectTrigger
            id={dayId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          >
            <SelectValue placeholder={tutorId ? "Choose a day" : "Choose a tutor first"} />
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d} value={d}>
                {formatDayLabel(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {day && (
        // Not `disabled`: that would also disable "Try again". Each time is switched off on its own.
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium leading-none">
            Time <span className="font-normal text-muted-foreground">(Melbourne time, {zone})</span>
          </legend>
          {loaded && "error" in loaded && (
            <div className="flex flex-wrap items-center gap-2">
              <ErrorMessage>{loaded.error}</ErrorMessage>
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}
          {!loaded && <p className="text-sm text-muted-foreground">Checking availability…</p>}
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`Times on ${formatDayLabel(day)}`}>
            {slots.map((slot) => {
              const taken = busy?.has(slot) ?? false;
              const tooSoon = !!now && !isSlotBookable(slot, now);
              const unavailable = taken || tooSoon;
              const selected = value === slot;
              return (
                <label
                  key={slot}
                  className={cn(
                    "relative flex h-9 items-center justify-center rounded-md border text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    unavailable || !busy
                      ? "cursor-not-allowed bg-muted/40 text-muted-foreground line-through opacity-60"
                      : selected
                        ? "cursor-pointer border-primary bg-primary text-primary-foreground"
                        : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={`${idPrefix}-time`}
                    value={slot}
                    checked={selected}
                    disabled={unavailable || !busy}
                    onChange={() => onChange(slot)}
                    className="sr-only"
                  />
                  {formatSlotTime(slot)}
                  {taken && <span className="sr-only"> (taken)</span>}
                  {!taken && tooSoon && <span className="sr-only"> (too soon to book)</span>}
                </label>
              );
            })}
          </div>
          {busy && <p className="text-xs text-muted-foreground">Crossed-out times are taken, or less than an hour away.</p>}
        </fieldset>
      )}
      {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
    </div>
  );
}
