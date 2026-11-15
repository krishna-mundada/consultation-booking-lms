"use client";

import { useState } from "react";
import { consultationsApi } from "@/lib/api/client";
import { toOutcome, type Outcome } from "@/lib/hooks/outcome";
import { CONSULTATION_ACTION, type CreateConsultationInput } from "@/lib/schemas/consultation";

export type ConsultationActions = {
  onSetCompleted: (id: string, completed: boolean) => Promise<Outcome>;
  onReschedule: (id: string, scheduledAt: string) => Promise<Outcome>;
  onCancel: (id: string) => Promise<Outcome>;
};

/**
 * What a student can do with their consultations. Every successful change calls `onChanged`, which loads
 * the list again, so what is shown always comes from the server (no optimistic state to drift).
 */
export function useConsultationActions(onChanged: () => void) {
  const [sessionExpired, setSessionExpired] = useState(false);

  async function run(action: () => Promise<unknown>): Promise<Outcome> {
    const outcome = await toOutcome(action);
    if (outcome.ok) onChanged();
    else if (outcome.sessionExpired) setSessionExpired(true);
    return outcome;
  }

  return {
    sessionExpired,
    create: (input: CreateConsultationInput) => run(() => consultationsApi.create(input)),
    reschedule: (id: string, scheduledAt: string) =>
      run(() => consultationsApi.update(id, { action: CONSULTATION_ACTION.reschedule, scheduled_at: scheduledAt })),
    setCompleted: (id: string, completed: boolean) =>
      run(() => consultationsApi.update(id, { action: CONSULTATION_ACTION.setCompleted, completed })),
    cancel: (id: string) => run(() => consultationsApi.update(id, { action: CONSULTATION_ACTION.cancel })),
  };
}
