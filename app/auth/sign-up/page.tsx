import type { Metadata } from "next";
import { SignUpForm } from "@/components/features/auth/sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  return (
    <div className="flex w-full flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm />
      </div>
    </div>
  );
}
