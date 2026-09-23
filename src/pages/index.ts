import type { APIRoute } from "astro";

export const prerender = false;

// The app has one screen: signed-in owners go straight to it, everyone else to sign-in.
export const GET: APIRoute = (context) => context.redirect(context.locals.user ? "/dashboard" : "/auth/signin");
