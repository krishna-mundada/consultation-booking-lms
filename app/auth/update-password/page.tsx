import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/features/auth/update-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function Page() {
  return (
    <div className="flex w-full flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
