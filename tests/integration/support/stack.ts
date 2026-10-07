import { createClient } from "@supabase/supabase-js";
import { resolveLocalStack } from "../../support/local-guards";

export interface Stack {
  url: string;
  anonKey: string;
}

// Reads the stack settings and refuses unsafe ones. Never skips: a skipped suite would pass CI vacuously.
// The rules live in tests/support/local-guards.ts, shared with the e2e run and the privileged connection.
export function requireStack(): Stack {
  return resolveLocalStack(
    "the integration suite",
    "The integration suite needs a reachable local Supabase stack: set SUPABASE_URL and SUPABASE_ANON_KEY " +
      "(context/foundation/test-plan.md §6.2 says how). It never skips when they are missing.",
  );
}

export function anonClient() {
  const { url, anonKey } = requireStack();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// A throwaway sign-up identity: unique per call, so parallel files and reruns never collide. The password meets the
// local stack's rules.
export function uniqueUser(prefix: string): { email: string; password: string } {
  return {
    email: `${prefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}@example.com`,
    password: `Integration-${Math.random().toString(36).slice(2, 12)}-Pw1!`,
  };
}

// A fresh signed-up user. On a local stack every new user becomes an owner through the seed trigger
// (supabase/seed.sql), so the returned client can read the owner-only tables and views.
export async function ownerClient() {
  const client = anonClient();
  const { email, password } = uniqueUser("integration");
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`owner sign-up failed: ${error.message}`);
  if (!data.session) {
    throw new Error("owner sign-up returned no session; local Supabase must have email confirmation turned off.");
  }
  return client;
}
