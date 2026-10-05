import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { APP_ENV, APP_ORIGIN, APP_VERSION } from "astro:env/server";
import { createLogger, type Logger } from "@/lib/logger";
import { requestIdFrom } from "@/lib/request-id";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// The received Origin header is attacker-controlled and unbounded, so only its start is logged.
const MAX_LOGGED_ORIGIN_CHARS = 200;

// Machine endpoints authenticated by bearer token, not cookies: exempt from the Origin (CSRF) check
// and from the per-request session lookup. Exact paths only.
const TOKEN_AUTH_ROUTES = new Set(["/api/ingest"]);

const rootLogger = createLogger({ version: APP_VERSION, environment: APP_ENV });

async function handle(context: APIContext, next: MiddlewareNext, log: Logger): Promise<Response> {
  if (TOKEN_AUTH_ROUTES.has(context.url.pathname)) {
    context.locals.user = null;
    return next();
  }

  if (!SAFE_METHODS.has(context.request.method) && context.url.pathname.startsWith("/api/")) {
    const requestOrigin = context.request.headers.get("Origin");
    const expectedOrigin = APP_ORIGIN ?? context.url.origin;

    if (requestOrigin !== expectedOrigin) {
      log.warn("origin_rejected", {
        expected: expectedOrigin,
        received: requestOrigin === null ? null : requestOrigin.slice(0, MAX_LOGGED_ORIGIN_CHARS),
      });
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
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestId = requestIdFrom(context.request.headers);
  // The pathname only: /auth/confirm carries a one-time token_hash and code in its query string.
  const log = rootLogger.child({ requestId, method: context.request.method, path: context.url.pathname });
  context.locals.requestId = requestId;
  context.locals.log = log;

  try {
    const response = await handle(context, next, log);
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    // Astro's own handler logs the same stack again in its text format; this line is the one with the request id.
    log.error("unhandled_error", { err: error });
    throw error;
  }
});
