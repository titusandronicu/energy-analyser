import type { APIRoute } from "astro";
import { requestMagicLink } from "@/lib/services/magic-link";
import { isSignupEnabled } from "@/lib/signup";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`);
  }

  const { redirect } = await requestMagicLink(await context.request.formData(), {
    sendOtp: (email, { shouldCreateUser }) => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser } }),
    signupEnabled: isSignupEnabled(),
    logError: (message, detail) => {
      // eslint-disable-next-line no-console -- server-side reason; the caller always sees the same page
      console.error(message, detail);
    },
  });
  return context.redirect(redirect);
};
