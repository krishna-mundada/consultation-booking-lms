"use client";

import { useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { hardNavigate } from "@/lib/hard-navigate";
import { MESSAGES } from "@/lib/messages";
import { ROUTES } from "@/lib/routes";
import { NAME_MAX, signUpNamesSchema } from "@/lib/schemas/people";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField, AuthForm, AuthLink, SubmitButton } from "./auth-form-parts";

export function SignUpForm(props: Omit<React.ComponentPropsWithoutRef<"div">, "title">) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const names = signUpNamesSchema.safeParse({ first_name: firstName, last_name: lastName });
    if (!names.success) {
      setError(MESSAGES.enterName);
      setIsLoading(false);
      return;
    }

    if (password !== repeatPassword) {
      setError(MESSAGES.passwordMismatch);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // The database turns these into the person's profile; it never reads a role from here.
          data: names.data,
          emailRedirectTo: `${window.location.origin}${ROUTES.dashboard}`,
        },
      });
      if (error) throw error;
      // Don't leave the typed passwords in memory, and use a full page load so no client state
      // from this form survives (see the note in login-form.tsx).
      setPassword("");
      setRepeatPassword("");
      // A session comes back immediately when email confirmation is off (local development);
      // otherwise the user must confirm by email first.
      hardNavigate(data.session ? ROUTES.dashboard : ROUTES.signUpSuccess);
    } catch (error: unknown) {
      setError(authErrorMessage(error, "signUp"));
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Sign up" description="Create a new account" {...props}>
      <AuthForm
        onSubmit={handleSignUp}
        footer={
          <>
            Already have an account? <AuthLink href={ROUTES.login}>Login</AuthLink>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <AuthField
            id="first-name"
            label="First name"
            autoComplete="given-name"
            required
            maxLength={NAME_MAX}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <AuthField
            id="last-name"
            label="Last name"
            autoComplete="family-name"
            required
            maxLength={NAME_MAX}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <AuthField
          id="email"
          label="Email"
          autoComplete="email"
          type="email"
          placeholder="m@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          id="password"
          label="Password"
          autoComplete="new-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField
          id="repeat-password"
          label="Repeat Password"
          autoComplete="new-password"
          type="password"
          required
          value={repeatPassword}
          onChange={(e) => setRepeatPassword(e.target.value)}
        />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <SubmitButton busy={isLoading} label="Sign up" busyLabel="Creating an account..." />
      </AuthForm>
    </AuthCard>
  );
}
