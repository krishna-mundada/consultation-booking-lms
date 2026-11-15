import { describe, expect, it } from "vitest";
import { createTestUser } from "../support/supabase";

// What can be reached by going straight at Supabase's public REST/Auth API, bypassing the app
// (ADR 0002). What the grants, RLS and triggers allow is proven in pgTAP; this is only what pgTAP cannot see:
// which parts of the platform are exposed at all.

const url = () => process.env.SUPABASE_URL!;
const key = () => process.env.SUPABASE_PUBLISHABLE_KEY!;
const headers = (token?: string) => ({
  apikey: key(),
  Authorization: `Bearer ${token ?? key()}`,
  "Content-Type": "application/json",
});

describe("direct API surface", () => {
  it("the unused GraphQL endpoint is not exposed", async () => {
    const res = await fetch(`${url()}/graphql/v1`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    expect(res.ok).toBe(false);
  });

  it("private helper functions cannot be called over RPC, with or without a schema header", async () => {
    const user = await createTestUser("student");
    const { data } = await user.db.auth.getSession();
    const token = data.session!.access_token;

    const inPublic = await fetch(`${url()}/rest/v1/rpc/is_admin`, { method: "POST", headers: headers(token), body: "{}" });
    expect(inPublic.status).toBe(404);

    const viaProfile = await fetch(`${url()}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: { ...headers(token), "Content-Profile": "private" },
      body: "{}",
    });
    expect(viaProfile.status).toBe(406); // schema `private` is not an exposed schema
  });
});
