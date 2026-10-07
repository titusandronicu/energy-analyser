import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { APP_ENV, APP_ORIGIN, APP_VERSION, SUPABASE_ANON_KEY, SUPABASE_URL } from "astro:env/server";
import { classifyAnonKey } from "@/lib/anon-key";
import { createLogger } from "@/lib/logger";

const log = createLogger({ version: APP_VERSION, environment: APP_ENV });
let warnedUnexpectedKey = false;

// Refuses a secret or service_role key, as it always has. A key that is neither a publishable key nor an anon JWT is
// only reported, once per process and by class: this release finds out what production really uses, and the next one
// refuses it (context/changes/refactor-followups/plan.md, phases 4 and 5). The key itself is never logged.
function assertAnonKey(key: string) {
  switch (classifyAnonKey(key)) {
    case "secret":
      throw new Error("SUPABASE_ANON_KEY must not contain a Supabase secret key");
    case "service_role":
      throw new Error("SUPABASE_ANON_KEY must not contain a service_role key");
    case "other":
      if (!warnedUnexpectedKey) {
        warnedUnexpectedKey = true;
        log.warn("anon_key_unexpected_shape", { keyClass: "other" });
      }
      return;
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
