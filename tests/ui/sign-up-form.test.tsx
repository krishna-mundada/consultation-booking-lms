import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignUpForm } from "@/components/features/auth/sign-up-form";

// Sign-up (ADR 0007, A1, A3): everyone who signs up is a student, and their name is how they are shown.
// The form sends the name; it never sends, and the database never reads, a role.

const { signUp, hardNavigate } = vi.hoisted(() => ({ signUp: vi.fn(), hardNavigate: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signUp } }) }));
vi.mock("@/lib/hard-navigate", () => ({ hardNavigate }));

beforeEach(() => {
  signUp.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
  hardNavigate.mockReset();
});

async function fill(user: ReturnType<typeof userEvent.setup>, over: Record<string, string> = {}) {
  const values = { "First name": "Ada", "Last name": "Lovelace", Email: "ada@example.com", Password: "abc12345", "Repeat Password": "abc12345", ...over };
  for (const [label, value] of Object.entries(values)) {
    if (value) await user.type(screen.getByLabelText(label), value);
  }
}

describe("SignUpForm", () => {
  it("asks for first and last name as well as email and password", () => {
    render(<SignUpForm />);
    for (const label of ["First name", "Last name", "Email", "Password", "Repeat Password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("sends the trimmed names with the sign-up, and nothing that could name a role", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fill(user, { "First name": "  Ada  " });
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(signUp).toHaveBeenCalledTimes(1);
    const [args] = signUp.mock.calls[0];
    expect(args.email).toBe("ada@example.com");
    expect(args.options.data).toEqual({ first_name: "Ada", last_name: "Lovelace" });
    expect(JSON.stringify(args)).not.toMatch(/role/i);
  });

  it("goes to the dashboard once signed up", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(hardNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it.each(["First name", "Last name"])("does not sign up without a %s", async (missing) => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fill(user, { [missing]: "" });
    // The browser's own required check would stop a real click; submit the form directly to test our check.
    fireEvent.submit(screen.getByRole("button", { name: "Sign up" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your first and last name.");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("does not sign up when the passwords differ", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fill(user, { "Repeat Password": "different1" });
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The two passwords do not match.");
    expect(signUp).not.toHaveBeenCalled();
  });
});
