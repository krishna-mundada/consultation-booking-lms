import { createClient } from "@/lib/supabase/server";
import { parseOtpType, safeRedirectPath } from "@/lib/auth/safe-redirect";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { ROUTES } from "@/lib/routes";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));

  if (!tokenHash || !type) redirect(ROUTES.authError);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect(ROUTES.authError);

  // Only ever to a path on this site, never to whatever ?next= says.
  redirect(safeRedirectPath(searchParams.get("next")));
}
