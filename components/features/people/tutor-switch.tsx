"use client";

import { useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { Switch } from "@/components/ui/switch";
import { peopleApi } from "@/lib/api/client";
import { HTTP_STATUS } from "@/lib/errors";
import { describeError } from "@/lib/hooks/outcome";
import { ROLE } from "@/lib/domain/roles";
import type { Person, SetTutorResult } from "@/lib/schemas/people";
import { DemoteDialog } from "./demote-dialog";

type TutorSwitchProps = {
  person: Person;
  /** Called after a change that succeeded, so the table can load again. */
  onChanged: (result: SetTutorResult, person: Person) => void;
};

/**
 * The tutor on/off switch for one person. The switch only moves once the server has accepted the change,
 * so it never shows something that did not happen. Turning a tutor off while they have upcoming
 * consultations asks the admin what to do with them first (a person who gets one between the table
 * loading and the click is caught by the server's 409, which opens the same question).
 */
export function TutorSwitch({ person, onChanged }: TutorSwitchProps) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTutor = person.role === ROLE.tutor;

  async function apply(tutor: boolean, cancelUpcoming?: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await peopleApi.setTutor(person.id, { tutor, cancel_upcoming: cancelUpcoming });
      setAsking(false);
      onChanged(result, person);
    } catch (failure) {
      const { message, status } = describeError(failure);
      if (status === HTTP_STATUS.conflict && !tutor) setAsking(true);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  function onToggle(next: boolean) {
    if (!next && person.upcoming > 0) setAsking(true);
    else void apply(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <Switch
        checked={isTutor}
        disabled={busy}
        onCheckedChange={onToggle}
        aria-label={`Tutor: ${person.display_name}`}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <DemoteDialog
        open={asking}
        name={person.display_name}
        upcoming={person.upcoming}
        busy={busy}
        onChoose={(cancelUpcoming) => void apply(false, cancelUpcoming)}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}
