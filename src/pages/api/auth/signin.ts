import type { APIRoute } from "astro";
import { signInWithPassword } from "@/lib/services/password-signin";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Password alternative to the magic link. Existing accounts only; there is no sign-up.
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`);
  }

  const { redirect } = await signInWithPassword(await context.request.formData(), {
    signIn: (credentials) => supabase.auth.signInWithPassword(credentials),
    logError: (message, detail) => {
      // eslint-disable-next-line no-console -- server-side reason; the caller sees a generic message
      console.error(message, detail);
    },
  });
  return context.redirect(redirect);
};
