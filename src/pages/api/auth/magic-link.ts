import type { APIRoute } from "astro";
import { withEmailHash } from "@/lib/logger";
import { requestMagicLink } from "@/lib/services/magic-link";
import { isSignupEnabled } from "@/lib/signup";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`);
  }

  const form = await context.request.formData();
  const log = withEmailHash(context.locals.log, form.get("email"));
  const { redirect } = await requestMagicLink(form, {
    sendOtp: (email, { shouldCreateUser }) => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser } }),
    signupEnabled: isSignupEnabled(),
    logError: (message, detail) => {
      log.error(message, { err: detail });
    },
  });
  return context.redirect(redirect);
};
