import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { MESSAGES } from "@/lib/messages";

// What a person reads when sign-in, sign-up or a password change fails. The text is fixed and
// chosen here: Supabase's own wording is never shown (it can reveal which emails have accounts).

const error = (code: string, message = "raw backend text that must not be shown") => ({ code, message });

describe("authErrorMessage", () => {
  it("never shows the backend's own wording", () => {
    for (const code of ["invalid_credentials", "user_already_exists", "weak_password", "something_new"]) {
      expect(authErrorMessage(error(code), "login")).not.toContain("raw backend text");
    }
  });

  it("tells a weak password in plain words, wherever it happens", () => {
    expect(authErrorMessage(error("weak_password"), "signUp")).toBe(MESSAGES.weakPassword);
    expect(authErrorMessage(error("weak_password"), "updatePassword")).toBe(MESSAGES.weakPassword);
  });

  it("says a login failed without saying whether the email exists", () => {
    expect(authErrorMessage(error("invalid_credentials"), "login")).toBe("Incorrect email or password.");
  });

  it("points an existing email at login or a reset, without confirming the account exists", () => {
    const message = authErrorMessage(error("user_already_exists"), "signUp");
    expect(message).toMatch(/may already have an account/i);
    expect(message).toMatch(/log in|reset/i);
  });

  it("asks an unconfirmed user to check their inbox", () => {
    expect(authErrorMessage(error("email_not_confirmed"), "login")).toMatch(/confirm your email/i);
  });

  it.each(["over_request_rate_limit", "over_email_send_rate_limit"])("asks for patience on %s", (code) => {
    expect(authErrorMessage(error(code), "forgotPassword")).toMatch(/too many attempts/i);
  });

  it("explains a reused password and an expired reset link", () => {
    expect(authErrorMessage(error("same_password"), "updatePassword")).toMatch(/different/i);
    expect(authErrorMessage(error("session_not_found"), "updatePassword")).toMatch(/link has expired/i);
  });

  it("recognises the library's own missing-session error, which has a name but no code", () => {
    const missing = { name: "AuthSessionMissingError", message: "Auth session missing!" };
    expect(authErrorMessage(missing, "updatePassword")).toMatch(/link has expired/i);
  });

  it.each([null, undefined, "boom", 42, {}, new Error("network down"), error("brand_new_code")])(
    "falls back to a generic message for anything unrecognised (%s)",
    (value) => {
      expect(authErrorMessage(value, "login")).toBe(MESSAGES.generic);
    },
  );
});
