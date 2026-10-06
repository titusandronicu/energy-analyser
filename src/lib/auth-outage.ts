// What an auth error means, which requests need a signed-in owner, and what the owner sees when the auth provider is
// down. Pure, so the rule is unit-tested; the middleware only applies the result.

export const PROTECTED_ROUTES = ["/dashboard"];

const NOTES_PATH = "/api/notes";
const ALERT_RULES_PATH = "/api/alert-rules";
const RETRY_AFTER_SECONDS = 30;

export type AuthErrorKind = "outage" | "session-missing" | "other";

interface AuthErrorLike {
  name?: string;
  status?: number;
}

// `getUser()` returns provider failures as `{ error }` instead of throwing. A missing session is normal (every anonymous
// request has one); a network failure, a 5xx or a 429 is the provider being down; everything else (an expired or
// invalid token) is an ordinary signed-out visitor.
export function classifyAuthError(error: AuthErrorLike | null): AuthErrorKind | null {
  if (error === null) return null;
  if (error.name === "AuthSessionMissingError") return "session-missing";
  if (error.name === "AuthRetryableFetchError") return "outage";
  if (typeof error.status === "number" && (error.status >= 500 || error.status === 429)) return "outage";
  return "other";
}

// Requests whose answer depends on a signed-in owner: the home page (it forwards to the dashboard or the sign-in page),
// the dashboard, and posting a note or an alert rule.
function needsUser(pathname: string, method: string): boolean {
  return (
    pathname === "/" ||
    PROTECTED_ROUTES.some((route) => pathname.startsWith(route)) ||
    (method === "POST" && (pathname === NOTES_PATH || pathname === ALERT_RULES_PATH))
  );
}

export interface AuthDecision {
  action: "continue" | "redirect-signin" | "unavailable";
  logEvent: "auth_unavailable" | null;
}

export function decideAuth(input: {
  pathname: string;
  method: string;
  user: unknown;
  error: AuthErrorLike | null;
}): AuthDecision {
  const kind = classifyAuthError(input.error);
  if (kind === "outage") {
    // An outage is always logged; only the requests that need the owner are refused, the rest continue as anonymous.
    return {
      action: needsUser(input.pathname, input.method) ? "unavailable" : "continue",
      logEvent: "auth_unavailable",
    };
  }
  const protectedRoute = PROTECTED_ROUTES.some((route) => input.pathname.startsWith(route));
  if (protectedRoute && !input.user) return { action: "redirect-signin", logEvent: null };
  return { action: "continue", logEvent: null };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`);
}

// A real 5xx the owner can read and a monitor can see, instead of a silent redirect to the sign-in page. Hand-built
// (not a rewrite to an .astro page), so its status is certain and it never re-enters the failing auth call.
export function unavailableResponse(requestId: string): Response {
  const id = escapeHtml(requestId);
  const html = `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Logowanie chwilowo niedostępne</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f1226; color: #e8ebff; font-family: system-ui, sans-serif; }
      main { max-width: 26rem; padding: 2rem; }
      h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
      p { color: #c3cadb; line-height: 1.5; }
      code { color: #e8ebff; }
    </style>
  </head>
  <body>
    <main>
      <h1>Logowanie jest chwilowo niedostępne</h1>
      <p>Nie możemy teraz połączyć się z usługą logowania. Spróbuj ponownie za chwilę.</p>
      <p>Kod zgłoszenia: <code>${id}</code></p>
    </main>
  </body>
</html>
`;
  return new Response(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(RETRY_AFTER_SECONDS),
      "X-Request-Id": requestId,
    },
  });
}
