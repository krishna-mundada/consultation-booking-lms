"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatConsultationTime } from "@/lib/dates";
import type { ApiConsultation } from "@/lib/schemas/consultation";

type CancelDialogProps = {
  consultation: ApiConsultation;
  onConfirm: () => void;
  /** Called when the dialog closes after a confirmation; return true if focus was moved elsewhere. */
  onClosedAfterConfirm: () => boolean;
};

export function CancelDialog({ consultation: c, onConfirm, onClosedAfterConfirm }: CancelDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive-text hover:bg-destructive-text/10 hover:text-destructive-text"
        >
          Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          // After a confirmed cancel the Cancel button is about to disappear; keep focus on the row
          // instead of dropping it to the page body.
          if (onClosedAfterConfirm()) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this consultation?</AlertDialogTitle>
          <AlertDialogDescription>
            Your consultation with {c.tutor_name} on {formatConsultationTime(c.scheduled_at)} will be cancelled and the
            time freed for others. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={onConfirm}>
            Yes, cancel it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
