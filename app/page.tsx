import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

// The proxy sends visitors without a session on to /auth/login.
export default function Home() {
  redirect(ROUTES.dashboard);
}
