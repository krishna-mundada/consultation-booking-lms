"use client";

import { useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HTTP_STATUS } from "@/lib/errors";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import type { Outcome } from "@/lib/hooks/outcome";
import { MESSAGES } from "@/lib/messages";
import { REASON_MAX, createConsultationSchema, type CreateConsultationInput, type Tutor } from "@/lib/schemas/consultation";
import { SlotPicker } from "./slot-picker";
import { TutorPicker } from "./tutor-picker";

const BOOKED_MESSAGE = "Consultation booked.";

type FieldKey = "tutor_id" | "scheduled_at" | "reason";
type BookingFormProps = { onSubmit: (input: CreateConsultationInput) => Promise<Outcome> };

/**
 * Book a consultation: pick a tutor, pick one of their free half-hour slots, and optionally say what it is
 * about (ADR 0007, A11-A16). The student never types a time, so there is nothing to mistype; the server and
 * database check everything again, and a slot that was taken in the meantime comes back as a message.
 */
export function BookingForm({ onSubmit }: BookingFormProps) {
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Bumped when the slot list may be out of date: after a booking, and after the server says "taken".
  const [refresh, setRefresh] = useState(0);
  // Disabled until the page is interactive: a native submit would lose the booking.
  const interactive = useHydrated();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBooked(false);
    setFormError(null);

    if (!tutor || !slot) {
      setErrors({
        ...(tutor ? {} : { tutor_id: MESSAGES.chooseTutor }),
        ...(slot ? {} : { scheduled_at: MESSAGES.chooseTime }),
      });
      return;
    }
    const parsed = createConsultationSchema.safeParse({ tutor_id: tutor.id, reason, scheduled_at: slot });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({ reason: fields.reason?.[0], scheduled_at: fields.scheduled_at?.[0], tutor_id: fields.tutor_id?.[0] });
      return;
    }

    setErrors({});
    setSubmitting(true);
    const outcome = await onSubmit(parsed.data);
    setSubmitting(false);

    if (outcome.ok) {
      // Keep the tutor (people often book the same one again); the chosen time is now taken.
      setSlot(null);
      setReason("");
      setBooked(true);
      setRefresh((n) => n + 1);
      return;
    }

    const rejected: Partial<Record<FieldKey, string>> = {
      tutor_id: outcome.fields.tutor_id?.[0],
      scheduled_at: outcome.fields.scheduled_at?.[0],
      reason: outcome.fields.reason?.[0],
    };
    if (Object.values(rejected).some(Boolean)) setErrors(rejected);
    else setFormError(outcome.message);
    if (outcome.status === HTTP_STATUS.conflict) {
      // Someone got there first, or the student already has something then: show what is free now.
      setSlot(null);
      setRefresh((n) => n + 1);
    }
  }

  return (
    // method="post" is the second line of defence: if a browser ever submits this natively, the
    // fields travel in the request body and never end up in the URL, history or server logs.
    <form onSubmit={submit} method="post" noValidate className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <TutorPicker
        value={tutor}
        error={errors.tutor_id}
        onChange={(next) => {
          setTutor(next);
          setSlot(null);
          setErrors((current) => ({ ...current, tutor_id: undefined }));
        }}
      />
      <SlotPicker
        tutorId={tutor?.id ?? null}
        value={slot}
        refreshToken={refresh}
        error={errors.scheduled_at}
        onChange={(next) => {
          setSlot(next);
          setErrors((current) => ({ ...current, scheduled_at: undefined }));
        }}
      />
      <div className="grid gap-2">
        <Label htmlFor="reason">
          What would you like help with? <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="reason"
          value={reason}
          maxLength={REASON_MAX}
          rows={3}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? "reason-error" : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        {errors.reason && <ErrorMessage id="reason-error">{errors.reason}</ErrorMessage>}
      </div>
      <Button type="submit" className="w-full" disabled={submitting || !interactive}>
        {submitting ? "Booking…" : "Book consultation"}
      </Button>
      {formError && <ErrorMessage>{formError}</ErrorMessage>}
      {/* The live region exists before its text does, so screen readers announce the change. */}
      <p role="status" className="text-sm font-medium text-primary empty:hidden">
        {booked ? BOOKED_MESSAGE : null}
      </p>
    </form>
  );
}
