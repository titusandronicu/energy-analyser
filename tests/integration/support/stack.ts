import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export interface Stack {
  url: string;
  anonKey: string;
}

// The role claim of a JWT-shaped key, or null when the key is not a decodable JWT.
function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof claims === "object" && claims !== null && "role" in claims && typeof claims.role === "string") {
      return claims.role;
    }
    return null;
  } catch {
    return null;
  }
}

// Reads the stack settings and refuses unsafe ones. Never skips: a skipped suite would pass CI vacuously.
// src/lib/supabase.ts has the same anon-key rule but imports `astro:env/server`, so it is replicated here.
export function requireStack(): Stack {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "The integration suite needs a reachable local Supabase stack: set SUPABASE_URL and SUPABASE_ANON_KEY " +
        "(context/foundation/test-plan.md §6.2 says how). It never skips when they are missing.",
    );
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL; the integration suite only runs against 127.0.0.1 or localhost.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run against SUPABASE_URL host "${host}": the integration suite writes data and only runs against a local stack (127.0.0.1 or localhost).`,
    );
  }

  if (anonKey.startsWith("sb_secret_") || jwtRole(anonKey) === "service_role") {
    throw new Error(
      "SUPABASE_ANON_KEY holds a secret or service_role key; secret keys are forbidden here. Use the anon (publishable) key.",
    );
  }

  return { url, anonKey };
}

export function anonClient() {
  const { url, anonKey } = requireStack();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// A fresh signed-up user. On a local stack every new user becomes an owner through the seed trigger
// (supabase/seed.sql), so the returned client can read the owner-only tables and views.
export async function ownerClient() {
  const client = anonClient();
  const email = `integration-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = `Integration-${Math.random().toString(36).slice(2, 12)}-Pw1!`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`owner sign-up failed: ${error.message}`);
  if (!data.session) {
    throw new Error("owner sign-up returned no session; local Supabase must have email confirmation turned off.");
  }
  return client;
}
