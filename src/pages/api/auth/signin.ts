import type { APIRoute } from "astro";
import { withEmailHash } from "@/lib/logger";
import { signInWithPassword } from "@/lib/services/password-signin";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Password alternative to the magic link. Existing accounts only; there is no sign-up.
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`);
  }

  const form = await context.request.formData();
  const log = withEmailHash(context.locals.log, form.get("email"));
  const { redirect } = await signInWithPassword(form, {
    signIn: (credentials) => supabase.auth.signInWithPassword(credentials),
    logError: (message, detail) => {
      log.error(message, { err: detail });
    },
  });
  return context.redirect(redirect);
};
