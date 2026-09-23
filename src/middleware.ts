import { defineMiddleware } from "astro:middleware";
import { APP_ORIGIN } from "astro:env/server";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Machine endpoints authenticated by bearer token, not cookies: exempt from the Origin (CSRF) check
// and from the per-request session lookup. Exact paths only.
const TOKEN_AUTH_ROUTES = new Set(["/api/ingest"]);

export const onRequest = defineMiddleware(async (context, next) => {
  if (TOKEN_AUTH_ROUTES.has(context.url.pathname)) {
    context.locals.user = null;
    return next();
  }

  if (!SAFE_METHODS.has(context.request.method) && context.url.pathname.startsWith("/api/")) {
    const requestOrigin = context.request.headers.get("Origin");
    const expectedOrigin = APP_ORIGIN ?? context.url.origin;

    if (requestOrigin !== expectedOrigin) {
      return new Response("Cross-site request forbidden", { status: 403 });
    }
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
