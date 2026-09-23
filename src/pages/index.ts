import type { APIRoute } from "astro";

export const prerender = false;

// The app has one screen: signed-in owners go straight to it, everyone else to sign-in.
// Supabase's default sign-in email returns to the Site URL (this page) with `?code=`; hand it to /auth/confirm.
export const GET: APIRoute = (context) => {
  const { searchParams } = context.url;
  if (searchParams.has("code") || searchParams.has("token_hash")) {
    return context.redirect(`/auth/confirm?${searchParams.toString()}`);
  }
  return context.redirect(context.locals.user ? "/dashboard" : "/auth/signin");
};
