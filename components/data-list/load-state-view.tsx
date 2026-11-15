import type { ReactNode } from "react";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { LOAD_STATE, type LoadState } from "@/lib/hooks/use-server-list";

/**
 * Renders the three states of a list that loads from the server: loading, failed (with a way to
 * try again, so a transient error is never a dead end), and ready. Every list screen uses it so they behave
 * the same.
 */
export function LoadStateView({
  status,
  error,
  onRetry,
  children,
}: {
  status: LoadState;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (status === LOAD_STATE.error) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <ErrorMessage>{error}</ErrorMessage>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (status === LOAD_STATE.loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  return <>{children}</>;
}
