"use client";

import { useState, type FormEvent } from "react";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HTTP_STATUS } from "@/lib/errors";
import { MESSAGES } from "@/lib/messages";
import type { ApiConsultation } from "@/lib/schemas/consultation";
import { SlotPicker } from "./slot-picker";
import type { ConsultationActions } from "./use-consultation-actions";

type RescheduleDialogProps = {
  consultation: ApiConsultation;
  onReschedule: ConsultationActions["onReschedule"];
};

/** Move a consultation to another free slot with the same tutor (ADR 0007, A15). */
export function RescheduleDialog({ consultation: c, onReschedule }: RescheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSlot(null);
      setError(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot) {
      setError(MESSAGES.chooseTime);
      return;
    }
    setSaving(true);
    const outcome = await onReschedule(c.id, slot);
    setSaving(false);
    if (outcome.ok) {
      setOpen(false);
      return;
    }
    setError(outcome.fields.scheduled_at?.[0] ?? outcome.message);
    if (outcome.status === HTTP_STATUS.conflict) {
      setSlot(null);
      setRefresh((n) => n + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reschedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={save} method="post" noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reschedule consultation</DialogTitle>
            <DialogDescription>Choose a new time with {c.tutor_name}.</DialogDescription>
          </DialogHeader>
          <SlotPicker
            tutorId={open ? c.tutor_id : null}
            value={slot}
            refreshToken={refresh}
            idPrefix={`reschedule-${c.id}`}
            onChange={(next) => {
              setSlot(next);
              setError(null);
            }}
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <DialogFooter>
            <Button type="submit" disabled={saving || !slot}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
