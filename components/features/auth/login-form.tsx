"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { hardNavigate } from "@/lib/hard-navigate";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField, AuthForm, AuthLink, SubmitButton } from "./auth-form-parts";

export function LoginForm(props: Omit<React.ComponentPropsWithoutRef<"div">, "title">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Never leave the typed password in memory, and use a full page load (not a client-side
      // route change): the router keeps previous screens alive, form state included, so a soft
      // navigation would leave this form, password and all, behind a later logout.
      setPassword("");
      hardNavigate(ROUTES.dashboard);
    } catch (error: unknown) {
      setError(authErrorMessage(error, "login"));
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Login" description="Enter your email below to login to your account" {...props}>
      <AuthForm
        onSubmit={handleLogin}
        footer={
          <>
            Don&apos;t have an account? <AuthLink href={ROUTES.signUp}>Sign up</AuthLink>
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
        <AuthField
          id="password"
          label="Password"
          labelAside={
            <Link href={ROUTES.forgotPassword} className="ml-auto inline-block text-sm underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          }
          autoComplete="current-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <SubmitButton busy={isLoading} label="Login" busyLabel="Logging in..." />
      </AuthForm>
    </AuthCard>
  );
}
