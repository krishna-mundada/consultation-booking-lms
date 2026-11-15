import { loadSupabaseEnv } from "./env";

// Integration tests need the local Supabase keys before any worker starts.
export default function setup() {
  loadSupabaseEnv();
}
