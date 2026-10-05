import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "./middleware";

// All data here is synthetic.
//
// Expected outcomes are written from the rules in CLAUDE.md (Environment) and docs/architecture.md, not read off the
// middleware: a mutating /api/* request must carry an Origin equal to APP_ORIGIN (or the request origin when it is
// unset), only the exact path /api/ingest skips that check and the session lookup, and a signed-out request to a
// /dashboard path goes to /auth/signin.

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

const REQUEST_ORIGIN = "http://localhost:4321";
const APP_ORIGIN = "https://app.example.test";

interface Outcome {
  status: number;
  location: string | null;
  nextCalled: boolean;
  sessionLookups: number;
  user: unknown;
}

interface Call {
  method?: string;
  path: string;
  origin?: string;
  user?: { id: string } | null;
  // "missing" models an unconfigured Supabase: createClient returns null.
  client?: "present" | "missing";
}

async function call({ method = "GET", path, origin, user = null, client = "present" }: Call): Promise<Outcome> {
  // The real client always returns `error` (null when there is none); the middleware now reads it to tell an outage from a signed-out visitor.
  const getUser = vi.fn(() => Promise.resolve({ data: { user }, error: null }));
  supabase.createClient.mockReturnValue(client === "present" ? { auth: { getUser } } : null);

  const url = new URL(path, REQUEST_ORIGIN);
  const headers = new Headers();
  if (origin !== undefined) headers.set("Origin", origin);
  const locals: { user?: unknown } = {};
  const context = {
    url,
    request: new Request(url, { method, headers }),
    locals,
    cookies: {},
    redirect: (to: string, status = 302) => new Response(null, { status, headers: { Location: to } }),
  };
  const next = vi.fn(() => Promise.resolve(new Response("next", { status: 200 })));

  const response = (await onRequest(context as unknown as Parameters<typeof onRequest>[0], next)) as Response;
  return {
    status: response.status,
    location: response.headers.get("Location"),
    nextCalled: next.mock.calls.length > 0,
    sessionLookups: getUser.mock.calls.length,
    user: locals.user,
  };
}

const REFUSED = { status: 403, nextCalled: false, sessionLookups: 0 };
const PASSED = { status: 200, nextCalled: true };

beforeEach(() => {
  env.APP_ORIGIN = undefined;
  supabase.createClient.mockReset();
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
});
