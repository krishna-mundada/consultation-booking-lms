import Link from "next/link";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdmin, isTutor } from "@/lib/domain/roles";
import { LogoutButton } from "./logout-button";
import { ROUTES } from "@/lib/routes";

export async function AuthButton() {
  const user = await getCurrentUser();

  return user ? (
    <div className="flex items-center gap-3">
      {isAdmin(user.role) && <Badge variant="secondary">Admin</Badge>}
      {isTutor(user.role) && <Badge variant="secondary">Tutor</Badge>}
      {/* Hidden on phones and truncated elsewhere: a long address must not push the nav off-screen. */}
      <span className="hidden max-w-[16rem] truncate text-muted-foreground sm:inline" title={user.email}>
        {user.email}
      </span>
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href={ROUTES.login}>Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href={ROUTES.signUp}>Sign up</Link>
      </Button>
    </div>
  );
}
