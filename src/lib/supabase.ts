import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { APP_ORIGIN, SUPABASE_ANON_KEY, SUPABASE_URL } from "astro:env/server";
import { classifyAnonKey } from "@/lib/anon-key";

// Only a publishable key or an anon JWT may be the app's key. A secret or service_role key, and any other shape
// (another role, an opaque string, surrounding whitespace), stops the client from being created. The message names the
// rule and never the key, a prefix or a length. Phase 4 ran this as a once-per-process warning first, so production's real
// key was known to be fine before this started refusing (context/changes/refactor-followups/plan.md).
function assertAnonKey(key: string) {
  switch (classifyAnonKey(key)) {
    case "secret":
      throw new Error("SUPABASE_ANON_KEY must not contain a Supabase secret key");
    case "service_role":
      throw new Error("SUPABASE_ANON_KEY must not contain a service_role key");
    case "other":
      throw new Error("SUPABASE_ANON_KEY must be an sb_publishable_ key or a JWT with role anon");
    case "publishable":
    case "anon":
      return;
  }
}

// For machine callers (the home-lab push): anon role, no cookies, no session.
export function createAnonClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  assertAnonKey(SUPABASE_ANON_KEY);
  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  assertAnonKey(SUPABASE_ANON_KEY);
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Session cookies are only ever read server-side (there is no browser Supabase client), so keep them away
    // from page scripts; mark them Secure when the app is served over HTTPS (APP_ORIGIN in production).
    cookieOptions: {
      httpOnly: true,
      secure: APP_ORIGIN?.startsWith("https://") ?? false,
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
