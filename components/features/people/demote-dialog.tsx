"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DemoteDialogProps = {
  open: boolean;
  name: string;
  upcoming: number;
  busy: boolean;
  onChoose: (cancelUpcoming: boolean) => void;
  onClose: () => void;
};

/**
 * What to do with a tutor's upcoming consultations when they stop being a tutor (ADR 0007, A8): cancel them
 * (each student is told, and the slots are freed) or keep them. Nothing happens until the admin chooses.
 */
export function DemoteDialog({ open, name, upcoming, busy, onChoose, onClose }: DemoteDialogProps) {
  const consultations = upcoming === 1 ? "1 upcoming consultation" : `${upcoming} upcoming consultations`;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turn off {name} as a tutor?</DialogTitle>
          <DialogDescription>
            {name} has {consultations}. Choose what happens to {upcoming === 1 ? "it" : "them"}.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2 text-sm text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">Cancel and notify:</strong> the{" "}
            {upcoming === 1 ? "consultation is" : "consultations are"} cancelled, each student sees a notice, and the
            time slots are freed.
          </li>
          <li>
            <strong className="font-medium text-foreground">Keep:</strong> nothing is cancelled and no one is
            notified. {name} can no longer be booked, but stays on the existing consultations.
          </li>
        </ul>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Go back
          </Button>
          <Button variant="secondary" onClick={() => onChoose(false)} disabled={busy}>
            Keep them
          </Button>
          <Button variant="destructive" onClick={() => onChoose(true)} disabled={busy}>
            Cancel them and notify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
