import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorPage from "@/app/error";

// The page shown when something throws while rendering. It must offer a way forward and must
// never print the error itself: messages can carry internals.

describe("the error page", () => {
  it("offers to try again and a way home, without showing the error's own text", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<ErrorPage error={new Error("secret database detail")} reset={reset} />);

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.queryByText(/secret database detail/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to the app/i })).toHaveAttribute("href", "/dashboard");

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
