"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorMessage } from "@/components/error-message";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, AuthField, AuthForm, SubmitButton } from "./auth-form-parts";

export function UpdatePasswordForm(props: Omit<React.ComponentPropsWithoutRef<"div">, "title">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push(ROUTES.dashboard);
    } catch (error: unknown) {
      setError(authErrorMessage(error, "updatePassword"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Reset Your Password" description="Please enter your new password below." {...props}>
      <AuthForm onSubmit={handleUpdatePassword}>
        <AuthField
          id="password"
          label="New password"
          autoComplete="new-password"
          type="password"
          placeholder="New password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <SubmitButton busy={isLoading} label="Save new password" busyLabel="Saving..." />
      </AuthForm>
    </AuthCard>
  );
}
