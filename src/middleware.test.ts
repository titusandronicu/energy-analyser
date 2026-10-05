import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "./middleware";

// All data here is synthetic.
//
// Expected outcomes are written from the rules in CLAUDE.md (Environment) and docs/architecture.md, not read off the
// middleware: a mutating /api/* request must carry an Origin equal to APP_ORIGIN (or the request origin when it is
// unset), only the exact path /api/ingest skips that check and the session lookup, and a signed-out request to a
// /dashboard path goes to /auth/signin. The auth-outage, request-id and logging cases are written from the
// 2026-10-05 entry in docs/decisions.md (observability capture layer): an inbound x-request-id is kept only when it is
// 8-64 characters of A-Za-z0-9._-, a network failure, a 5xx or a 429 from the auth provider answers 503 with
// Retry-After: 30 on "/", "/dashboard" and POST /api/notes, a missing session or an invalid token stays a silent
// redirect, and a logged path carries no query string.

const env = vi.hoisted(() => ({ APP_ORIGIN: undefined as string | undefined }));
const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("astro:middleware", () => ({
  // The real helper is an identity function that types the handler.
  defineMiddleware: <T>(handler: T) => handler,
}));
vi.mock("astro:env/server", () => ({
  // A getter, so each test sets the value it needs before calling onRequest.
  get APP_ORIGIN() {
    return env.APP_ORIGIN;
  },
  // Read once at import time by the middleware's logger (added with the observability capture layer).
  APP_VERSION: "test",
  APP_ENV: "test",
}));
vi.mock("@/lib/supabase", () => ({ createClient: supabase.createClient }));

// A logger that records instead of writing to stderr. `bound` holds the fields a child logger added to every line (the
// request id, method and path), so a test can see what was logged and under which request.
interface LoggedLine {
  level: "error" | "warn";
  event: string;
  fields: Record<string, unknown> | undefined;
  bound: Record<string, unknown>;
}
const logged = vi.hoisted(() => ({ lines: [] as LoggedLine[] }));
vi.mock("@/lib/logger", async (importOriginal) => {
  // Only createLogger is replaced; every other export of the module stays real, so a new import in the middleware does
  // not break the mock.
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  interface FakeLogger {
    error: (event: string, fields?: Record<string, unknown>) => void;
    warn: (event: string, fields?: Record<string, unknown>) => void;
    child: (more: Record<string, unknown>) => FakeLogger;
  }
  const make = (bound: Record<string, unknown>): FakeLogger => ({
    error: (event, fields) => logged.lines.push({ level: "error", event, fields, bound }),
    warn: (event, fields) => logged.lines.push({ level: "warn", event, fields, bound }),
    child: (more) => make({ ...bound, ...more }),
  });
  return { ...actual, createLogger: () => make({}) };
});

const REQUEST_ORIGIN = "http://localhost:4321";
const APP_ORIGIN = "https://app.example.test";

interface Outcome {
  status: number;
  location: string | null;
  nextCalled: boolean;
  sessionLookups: number;
  user: unknown;
  headers: Headers;
  body: string;
  // What the middleware put on context.locals for the pages to use.
  locals: { user?: unknown; requestId?: unknown };
}

interface AuthError {
  name?: string;
  status?: number;
}

interface Call {
  method?: string;
  path: string;
  origin?: string;
  // Extra request headers, for example x-request-id.
  headers?: Record<string, string>;
  user?: { id: string } | null;
  // What getUser() returns as `error`; the real client returns null when there is none.
  authError?: AuthError | null;
  // "missing" models an unconfigured Supabase: createClient returns null.
  client?: "present" | "missing";
  // Makes the downstream handler throw, to see what the middleware does with an unhandled error.
  nextError?: Error;
}

async function call({
  method = "GET",
  path,
  origin,
  headers: extraHeaders = {},
  user = null,
  authError = null,
  client = "present",
  nextError,
}: Call): Promise<Outcome> {
  // The real client always returns `error` (null when there is none); the middleware reads it to tell an outage from a
  // signed-out visitor.
  const getUser = vi.fn(() => Promise.resolve({ data: { user }, error: authError }));
  supabase.createClient.mockReturnValue(client === "present" ? { auth: { getUser } } : null);

  const url = new URL(path, REQUEST_ORIGIN);
  const headers = new Headers(extraHeaders);
  if (origin !== undefined) headers.set("Origin", origin);
  const locals: { user?: unknown; requestId?: unknown } = {};
  const context = {
    url,
    request: new Request(url, { method, headers }),
    locals,
    cookies: {},
    redirect: (to: string, status = 302) => new Response(null, { status, headers: { Location: to } }),
  };
  const next = vi.fn(() =>
    nextError ? Promise.reject(nextError) : Promise.resolve(new Response("next", { status: 200 })),
  );

  const response = (await onRequest(context as unknown as Parameters<typeof onRequest>[0], next)) as Response;
  return {
    status: response.status,
    location: response.headers.get("Location"),
    nextCalled: next.mock.calls.length > 0,
    sessionLookups: getUser.mock.calls.length,
    user: locals.user,
    headers: response.headers,
    body: await response.text(),
    locals,
  };
}

const REFUSED = { status: 403, nextCalled: false, sessionLookups: 0 };
const PASSED = { status: 200, nextCalled: true };

beforeEach(() => {
  env.APP_ORIGIN = undefined;
  supabase.createClient.mockReset();
  logged.lines.length = 0;
});

describe("onRequest", () => {
  describe("Origin check on mutating /api requests, APP_ORIGIN set", () => {
    beforeEach(() => {
      env.APP_ORIGIN = APP_ORIGIN;
    });

    describe.each(["POST", "PUT", "PATCH", "DELETE"])("%s /api/notes", (method) => {
      it.each<[string, string | undefined, boolean]>([
        ["no Origin header", undefined, false],
        ['Origin "null"', "null", false],
        ["a foreign origin", "https://evil.example.test", false],
        ["the app origin with a trailing slash", `${APP_ORIGIN}/`, false],
        ["the app host on another port", "https://app.example.test:8443", false],
        ["the app host on another scheme", "http://app.example.test", false],
        ["the request origin while APP_ORIGIN is set", REQUEST_ORIGIN, false],
        ["exactly APP_ORIGIN", APP_ORIGIN, true],
      ])("%s", async (_label, origin, allowed) => {
        const outcome = await call({ method, path: "/api/notes", origin });

        if (allowed) {
          expect(outcome).toMatchObject({ ...PASSED, sessionLookups: 1 });
        } else {
          expect(outcome).toMatchObject(REFUSED);
        }
      });
    });
  });

  describe("Origin check with APP_ORIGIN unset", () => {
    it.each<[string, string | undefined, boolean]>([
      ["falls back to the request origin", REQUEST_ORIGIN, true],
      ["refuses a foreign origin", "https://evil.example.test", false],
      ["refuses the request origin with a trailing slash", `${REQUEST_ORIGIN}/`, false],
      ["refuses the request host on another port", "http://localhost:3000", false],
      ["refuses a missing Origin", undefined, false],
    ])("POST /api/notes %s", async (_label, origin, allowed) => {
      const outcome = await call({ method: "POST", path: "/api/notes", origin });

      if (allowed) {
        expect(outcome).toMatchObject({ ...PASSED, sessionLookups: 1 });
      } else {
        expect(outcome).toMatchObject(REFUSED);
      }
    });
  });

  describe("every mutating /api route needs the Origin", () => {
    it.each(["/api/auth/signin", "/api/auth/magic-link", "/api/auth/signout", "/api/notes", "/api/anything-new"])(
      "POST %s with a foreign Origin is refused before the session lookup",
      async (path) => {
        env.APP_ORIGIN = APP_ORIGIN;

        expect(await call({ method: "POST", path, origin: "https://evil.example.test" })).toMatchObject(REFUSED);
      },
    );
  });

  describe("safe methods", () => {
    it.each(["GET", "HEAD", "OPTIONS"])("%s /api/health with a foreign Origin is not refused", async (method) => {
      env.APP_ORIGIN = APP_ORIGIN;

      expect(await call({ method, path: "/api/health", origin: "https://evil.example.test" })).toMatchObject(PASSED);
    });

    it("GET /api/health with no Origin is not refused", async () => {
      env.APP_ORIGIN = APP_ORIGIN;

      expect(await call({ path: "/api/health" })).toMatchObject(PASSED);
    });
  });

  describe("token-authenticated /api/ingest", () => {
    it.each<[string, string | undefined]>([
      ["no Origin", undefined],
      ["a foreign Origin", "https://evil.example.test"],
    ])("POST /api/ingest with %s goes straight to next, with no user and no session lookup", async (_label, origin) => {
      env.APP_ORIGIN = APP_ORIGIN;

      const outcome = await call({ method: "POST", path: "/api/ingest", origin, user: { id: "user-1" } });

      expect(outcome).toMatchObject({ ...PASSED, sessionLookups: 0, user: null });
    });

    it.each(["/api/ingest/", "/api/ingest/x", "/api/ingestx", "/api/INGEST", "/api/ingest//"])(
      "POST %s is not exempt: refused without a matching Origin, session looked up with one",
      async (path) => {
        env.APP_ORIGIN = APP_ORIGIN;

        expect(await call({ method: "POST", path })).toMatchObject(REFUSED);
        expect(await call({ method: "POST", path, origin: "https://evil.example.test" })).toMatchObject(REFUSED);
        expect(await call({ method: "POST", path, origin: APP_ORIGIN })).toMatchObject({
          ...PASSED,
          sessionLookups: 1,
        });
      },
    );

    it("the exempt set is exactly /api/ingest", async () => {
      env.APP_ORIGIN = APP_ORIGIN;
      // Every path the app serves or could plausibly add, plus near misses of the exempt one. A path is exempt when a
      // POST with a foreign Origin still reaches next without a session lookup.
      const candidates = [
        "/",
        "/dashboard",
        "/dashboard/history",
        "/auth/signin",
        "/auth/check-email",
        "/auth/confirm",
        "/api",
        "/api/",
        "/api/health",
        "/api/auth/signin",
        "/api/auth/magic-link",
        "/api/auth/signout",
        "/api/notes",
        "/api/ingest",
        "/api/ingest/",
        "/api/ingest/x",
        "/api/ingestx",
        "/api/anything-new",
      ];

      const exempt: string[] = [];
      for (const path of candidates) {
        const outcome = await call({ method: "POST", path, origin: "https://evil.example.test" });
        if (outcome.nextCalled && outcome.sessionLookups === 0) exempt.push(path);
      }

      // Pages outside /api/ are not Origin-checked, but they still do the session lookup, so they never count as exempt.
      expect(exempt).toEqual(["/api/ingest"]);
    });
  });

  describe("protected pages", () => {
    it.each(["/dashboard", "/dashboard/history", "/dashboardX"])(
      "%s without a user redirects to /auth/signin with 302",
      async (path) => {
        const outcome = await call({ path });

        expect(outcome).toMatchObject({ status: 302, location: "/auth/signin", nextCalled: false, sessionLookups: 1 });
      },
    );

    it.each(["/dashboard", "/dashboard/history", "/dashboardX"])("%s with a user passes", async (path) => {
      const outcome = await call({ path, user: { id: "user-1" } });

      expect(outcome).toMatchObject({ ...PASSED, user: { id: "user-1" } });
    });

    it.each(["/auth/signin", "/api/health", "/"])("%s needs no user", async (path) => {
      const outcome = await call({ path });

      expect(outcome).toMatchObject({ ...PASSED, user: null });
    });
  });

  describe("Supabase client missing", () => {
    it("leaves locals.user null and still passes an unprotected path", async () => {
      const outcome = await call({ path: "/auth/signin", client: "missing" });

      expect(outcome).toMatchObject({ ...PASSED, user: null, sessionLookups: 0 });
    });

    it.each(["/dashboard", "/dashboard/history"])("%s still redirects to /auth/signin", async (path) => {
      const outcome = await call({ path, client: "missing" });

      expect(outcome).toMatchObject({ status: 302, location: "/auth/signin", nextCalled: false });
    });

    it("still refuses a foreign Origin on a mutating /api route", async () => {
      env.APP_ORIGIN = APP_ORIGIN;

      expect(
        await call({ method: "POST", path: "/api/notes", origin: "https://evil.example.test", client: "missing" }),
      ).toMatchObject({ status: 403, nextCalled: false });
    });
  });

  describe("request id", () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    it.each<[string, Call, number]>([
      ["a request that passes", { path: "/api/health" }, 200],
      ["a refused cross-site request", { method: "POST", path: "/api/notes" }, 403],
      ["a redirect to sign-in", { path: "/dashboard" }, 302],
      ["an auth outage page", { path: "/dashboard", authError: { status: 503 } }, 503],
    ])("%s carries a generated X-Request-Id that matches locals.requestId", async (_label, request, status) => {
      const outcome = await call(request);

      expect(outcome.status).toBe(status);
      const id = outcome.headers.get("X-Request-Id");
      expect(id).toMatch(UUID);
      expect(outcome.locals.requestId).toBe(id);
    });

    it.each(["abcdefgh", "req-12345678", "A.b_c-9.Z_y-8.x", "a".repeat(64)])(
      "keeps the inbound id %j",
      async (inbound) => {
        const outcome = await call({ path: "/api/health", headers: { "x-request-id": inbound } });

        expect(outcome.headers.get("X-Request-Id")).toBe(inbound);
        expect(outcome.locals.requestId).toBe(inbound);
      },
    );

    it.each([
      ["7 characters", "abcdefg"],
      ["65 characters", "a".repeat(65)],
      ["a space", "abcd efgh"],
      ["a slash", "abc/defghi"],
      ["markup", "<b>abcdefgh</b>"],
      ["a punctuation mark outside . _ -", "abcdefg!"],
    ])("replaces an inbound id with %s", async (_label, inbound) => {
      const outcome = await call({ path: "/api/health", headers: { "x-request-id": inbound } });

      const id = outcome.headers.get("X-Request-Id");
      expect(id).not.toBe(inbound);
      expect(id).toMatch(UUID);
    });

    it("is on every logged line of the request, so the log and the response can be matched", async () => {
      const outcome = await call({ path: "/dashboard", authError: { status: 503 } });

      const id = outcome.headers.get("X-Request-Id");
      expect(logged.lines.length).toBeGreaterThan(0);
      for (const line of logged.lines)
        expect(line.bound).toMatchObject({ requestId: id, method: "GET", path: "/dashboard" });
    });
  });

  describe("auth provider outage", () => {
    // A network failure, a 5xx or a 429 is the provider being down (docs/decisions.md, 2026-10-05).
    const OUTAGES: [string, AuthError][] = [
      ["a network failure", { name: "AuthRetryableFetchError" }],
      ["a 500", { name: "AuthApiError", status: 500 }],
      ["a 502", { name: "AuthApiError", status: 502 }],
      ["a 503", { name: "AuthApiError", status: 503 }],
      ["a 504", { name: "AuthApiError", status: 504 }],
      ["a 599", { name: "AuthApiError", status: 599 }],
      ["a 429", { name: "AuthApiError", status: 429 }],
    ];
    // A missing session or an invalid token is an ordinary signed-out visitor, and so is any other error.
    const NOT_OUTAGES: [string, AuthError][] = [
      ["a missing session", { name: "AuthSessionMissingError", status: 400 }],
      ["an invalid token", { name: "AuthApiError", status: 401 }],
      ["a bad request", { name: "AuthApiError", status: 400 }],
      ["a 499", { name: "AuthApiError", status: 499 }],
    ];

    // The requests whose answer needs the signed-in owner: the home page, the dashboard and posting a note.
    const NEED_THE_OWNER: [string, string][] = [
      ["GET", "/"],
      ["GET", "/dashboard"],
      ["GET", "/dashboard/history"],
      ["POST", "/api/notes"],
    ];
    // Everything else keeps working as anonymous, so the owner can still reach the sign-in routes.
    const KEEP_WORKING: [string, string][] = [
      ["GET", "/auth/signin"],
      ["GET", "/api/health"],
      ["POST", "/api/auth/signin"],
      ["POST", "/api/auth/magic-link"],
    ];

    describe.each(OUTAGES)("%s", (_outage, authError) => {
      it.each(NEED_THE_OWNER)("answers %s %s with a 503 page, not a redirect", async (method, path) => {
        const outcome = await call({ method, path, origin: REQUEST_ORIGIN, authError });

        expect(outcome).toMatchObject({ status: 503, nextCalled: false, location: null });
        expect(outcome.headers.get("Retry-After")).toBe("30");
        expect(outcome.headers.get("Cache-Control")).toBe("no-store");
        expect(outcome.headers.get("Content-Type")).toContain("text/html");
        // The page shows the request id, so the owner can quote it and it can be found in the log.
        const id = outcome.headers.get("X-Request-Id");
        expect(id).not.toBeNull();
        expect(outcome.body).toContain(String(id));
        expect(logged.lines.filter((line) => line.event === "auth_unavailable")).toHaveLength(1);
        expect(logged.lines[0]).toMatchObject({ level: "error", event: "auth_unavailable", bound: { requestId: id } });
      });

      it.each(KEEP_WORKING)("lets %s %s continue as anonymous, and still logs the outage", async (method, path) => {
        const outcome = await call({ method, path, origin: REQUEST_ORIGIN, authError });

        expect(outcome).toMatchObject({ ...PASSED, user: null });
        expect(logged.lines.filter((line) => line.event === "auth_unavailable")).toHaveLength(1);
      });
    });

    describe.each(NOT_OUTAGES)("%s", (_error, authError) => {
      it("stays a silent redirect from the dashboard, with no outage logged", async () => {
        const outcome = await call({ path: "/dashboard", authError });

        expect(outcome).toMatchObject({ status: 302, location: "/auth/signin", nextCalled: false });
        expect(logged.lines.some((line) => line.event === "auth_unavailable")).toBe(false);
      });
    });

    it("passes a signed-in owner and logs nothing when the provider answers without an error", async () => {
      const outcome = await call({ path: "/dashboard", user: { id: "owner-1" } });

      expect(outcome).toMatchObject({ ...PASSED, user: { id: "owner-1" } });
      expect(logged.lines).toEqual([]);
    });
  });

  describe("logging", () => {
    it("logs a refused Origin with what was expected and what arrived", async () => {
      env.APP_ORIGIN = APP_ORIGIN;

      const outcome = await call({ method: "POST", path: "/api/notes", origin: "https://evil.example.test" });

      expect(outcome.status).toBe(403);
      expect(logged.lines).toHaveLength(1);
      expect(logged.lines[0]).toMatchObject({
        level: "warn",
        event: "origin_rejected",
        fields: { expected: APP_ORIGIN, received: "https://evil.example.test" },
        bound: { requestId: outcome.headers.get("X-Request-Id"), method: "POST", path: "/api/notes" },
      });
    });

    it("logs a missing Origin as null", async () => {
      env.APP_ORIGIN = APP_ORIGIN;

      await call({ method: "POST", path: "/api/notes" });

      expect(logged.lines[0]).toMatchObject({ event: "origin_rejected", fields: { received: null } });
    });

    it("logs only the first 200 characters of an attacker-controlled Origin", async () => {
      env.APP_ORIGIN = APP_ORIGIN;
      const long = `https://${"a".repeat(300)}.example.test`;

      await call({ method: "POST", path: "/api/notes", origin: long });

      const received = logged.lines[0]?.fields?.received;
      expect(received).toBe(long.slice(0, 200));
    });

    it("writes the path without its query string, because /auth/confirm carries one-time tokens there", async () => {
      await call({ path: "/auth/confirm?token_hash=secretvalue&code=abc123", authError: { status: 503 } });

      expect(logged.lines).toHaveLength(1);
      expect(logged.lines[0]?.bound.path).toBe("/auth/confirm");
      expect(JSON.stringify(logged.lines)).not.toContain("secretvalue");
      expect(JSON.stringify(logged.lines)).not.toContain("abc123");
    });

    it("logs an unhandled error with the request id and lets it propagate", async () => {
      const failure = new Error("downstream failed");

      await expect(call({ path: "/api/health", nextError: failure })).rejects.toBe(failure);

      expect(logged.lines).toHaveLength(1);
      expect(logged.lines[0]).toMatchObject({ level: "error", event: "unhandled_error", fields: { err: failure } });
      expect(typeof logged.lines[0]?.bound.requestId).toBe("string");
    });
  });
});
