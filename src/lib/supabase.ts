import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { APP_ORIGIN, SUPABASE_ANON_KEY, SUPABASE_URL } from "astro:env/server";

function assertAnonKey(key: string) {
  if (key.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_ANON_KEY must not contain a Supabase secret key");
  }

  const payload = key.split(".")[1];
  if (!payload) return;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as { role?: string };
    if (decoded.role === "service_role") {
      throw new Error("SUPABASE_ANON_KEY must not contain a service_role key");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("service_role")) throw error;
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
