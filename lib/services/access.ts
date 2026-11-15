import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fetchRole } from "@/lib/auth/fetch-role";
import type { Viewer } from "@/lib/domain/consultation-rules";
import { can, type Capability, type Role } from "@/lib/domain/roles";
import { ForbiddenError, InternalError } from "@/lib/errors";

// Who is asking, and what their role allows, for one request. Every service shares one of these, so
// the role is read from the database once however many services the request touches.

export type Db = SupabaseClient<Database>;

/** Log the real cause server-side; return a generic error so internals never reach the client. */
export function fail(context: string, error: PostgrestError): never {
  console.error(`[api] ${context}`, { code: error.code, message: error.message });
  throw new InternalError();
}

export function createAccess(db: Db, userId: string) {
  let roleLookup: Promise<Role | null> | undefined;

  function role(): Promise<Role | null> {
    roleLookup ??= fetchRole(db, userId).then(({ role: found, error }) => {
      if (error) fail("read role", error); // the API must not guess: a failed lookup grants nothing
      return found;
    });
    return roleLookup;
  }

  return {
    userId,
    role,
    async viewer(): Promise<Viewer> {
      return { id: userId, role: await role() };
    },
    /** Refuses with 403 unless the caller's role holds the capability (lib/domain/roles.ts). */
    async assertCan(capability: Capability): Promise<void> {
      if (!can(await role(), capability)) throw new ForbiddenError();
    },
  };
}

export type Access = ReturnType<typeof createAccess>;
