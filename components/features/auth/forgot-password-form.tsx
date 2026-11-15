"use client";

import { useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField, AuthForm, AuthLink, SubmitButton } from "./auth-form-parts";

export function ForgotPasswordForm(props: Omit<React.ComponentPropsWithoutRef<"div">, "title">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      // The url which will be included in the email. This URL needs to be configured in your redirect URLs in the Supabase dashboard at https://supabase.com/dashboard/project/_/auth/url-configuration
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${ROUTES.updatePassword}`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(authErrorMessage(error, "forgotPassword"));
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <AuthCard title="Check Your Email" description="Password reset instructions sent" {...props}>
        <p className="text-sm text-muted-foreground">
          If you registered using your email and password, you will receive a password reset email.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset Your Password"
      description="Type in your email and we'll send you a link to reset your password"
      {...props}
    >
      <AuthForm
        onSubmit={handleForgotPassword}
        footer={
          <>
            Already have an account? <AuthLink href={ROUTES.login}>Login</AuthLink>
          </>
        }
      >
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
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <SubmitButton busy={isLoading} label="Send reset email" busyLabel="Sending..." />
      </AuthForm>
    </AuthCard>
  );
}
