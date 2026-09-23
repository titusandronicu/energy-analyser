import type { APIRoute } from "astro";
import { confirmMagicLink } from "@/lib/services/magic-link";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Target of the emailed sign-in link. verifyOtp on the cookie-bound client sets the session cookies.
export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`);
  }

  const { redirect } = await confirmMagicLink(context.url, {
    verifyOtp: (params) => supabase.auth.verifyOtp(params),
    logError: (message, detail) => {
      // eslint-disable-next-line no-console -- server-side reason; the caller sees a generic error
      console.error(message, detail);
    },
  });
  return context.redirect(redirect);
};
