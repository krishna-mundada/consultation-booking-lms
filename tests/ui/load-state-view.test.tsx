import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadStateView } from "@/components/data-list/load-state-view";
import { LOAD_STATE } from "@/lib/hooks/use-server-list";

// One place renders loading / error / ready for both the student and the admin screens, so
// they cannot drift apart. A failed load must give the user something to do.

describe("LoadStateView", () => {
  it("shows a loading message and no content while loading", () => {
    render(
      <LoadStateView status={LOAD_STATE.loading} error={null} onRetry={vi.fn()}>
        <p>the list</p>
      </LoadStateView>,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("the list")).not.toBeInTheDocument();
  });

  it("shows the content when ready", () => {
    render(
      <LoadStateView status={LOAD_STATE.ready} error={null} onRetry={vi.fn()}>
        <p>the list</p>
      </LoadStateView>,
    );
    expect(screen.getByText("the list")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error and a Try again button that retries (a dead end otherwise)", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <LoadStateView status={LOAD_STATE.error} error="Something went wrong" onRetry={onRetry}>
        <p>the list</p>
      </LoadStateView>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.queryByText("the list")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
