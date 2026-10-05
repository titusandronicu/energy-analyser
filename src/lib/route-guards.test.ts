import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Protection in this app is a path prefix (PROTECTED_ROUTES in src/middleware.ts), not a per-page decision, so a new
// owner page outside /dashboard would be open and nothing else would flag it. This test makes that decision explicit.
//
// THIS TABLE IS THE SINGLE PLACE TO RECORD A NEW ROUTE'S GUARD. Adding a file under src/pages fails the test until the
// route has a row here; the row says how the route is protected:
//   middleware-prefix  a page behind PROTECTED_ROUTES ("/dashboard" and below); signed-out requests are redirected
//   handler-session    a mutating /api route that checks locals.user itself (and sits behind the middleware Origin check)
//   token              a bearer-token endpoint exempt from the Origin check and the session (TOKEN_AUTH_ROUTES)
//   public             needs no sign-in and serves no owner data
// Hand-written from the route inventory in context/archive/2026-10-02-testing-access-and-input-abuse/research.md section 1.

type Guard = "middleware-prefix" | "handler-session" | "token" | "public";

interface RouteEntry {
  methods: string[];
  guard: Guard;
  // The route changes state (writes data or sets/clears a session), by method: any method other than GET.
  mutates: boolean;
  // The page loads the owner's data.
  ownerData: boolean;
}

const get = (guard: Guard, ownerData = false): RouteEntry => ({ methods: ["GET"], guard, mutates: false, ownerData });
const post = (guard: Guard): RouteEntry => ({ methods: ["POST"], guard, mutates: true, ownerData: false });

const ROUTES: Record<string, RouteEntry> = {
  "/": get("public"),
  "/auth/signin": get("public"),
  "/auth/check-email": get("public"),
  "/auth/confirm": get("public"),
  "/api/health": get("public"),
  "/dashboard": get("middleware-prefix", true),
  "/dashboard/history": get("middleware-prefix", true),
  "/api/auth/signin": post("public"),
  "/api/auth/magic-link": post("public"),
  "/api/auth/signout": post("public"),
  "/api/notes": post("handler-session"),
  "/api/ingest": post("token"),
};

// The prefix the middleware protects, written from CLAUDE.md (Auth flow), not read from the code.
const PROTECTED_PREFIX = "/dashboard";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

const PAGES_DIR = fileURLToPath(new URL("../pages", import.meta.url));

interface PageFile {
  route: string;
  file: string;
  path: string;
}

function listPageFiles(dir: string, prefix = ""): PageFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry): PageFile[] => {
    if (entry.isDirectory()) return listPageFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`);
    const file = `${prefix}${entry.name}`;
    const route = `/${file.replace(/\.(astro|ts|tsx)$/, "").replace(/(^|\/)index$/, "")}`;
    return [{ route, file, path: `${dir}/${entry.name}` }];
  });
}

const pageFiles = listPageFiles(PAGES_DIR);

describe("route guard inventory", () => {
  it("finds the page files", () => {
    // Guards against a broken walk that would make the checks below pass on an empty list.
    expect(pageFiles.length).toBeGreaterThan(0);
  });

  it("has no two files for one route", () => {
    const routes = pageFiles.map((page) => page.route);

    expect(routes.filter((route, index) => routes.indexOf(route) !== index)).toEqual([]);
  });

  it("has an entry for every page file", () => {
    const missing = pageFiles.filter((page) => !(page.route in ROUTES)).map((page) => `${page.route} (${page.file})`);

    expect(missing, "add a row to ROUTES in route-guards.test.ts that records how each new route is guarded").toEqual(
      [],
    );
  });

  it("has a page file for every entry", () => {
    const existing = new Set(pageFiles.map((page) => page.route));

    expect(
      Object.keys(ROUTES).filter((route) => !existing.has(route)),
      "remove the row from ROUTES in route-guards.test.ts, or restore the route's file",
    ).toEqual([]);
  });

  it("marks mutating exactly when a method other than GET, HEAD or OPTIONS is served", () => {
    const wrong = Object.entries(ROUTES)
      .filter(([, entry]) => entry.mutates !== entry.methods.some((method) => !SAFE_METHODS.includes(method)))
      .map(([route]) => route);

    expect(wrong).toEqual([]);
  });

  it("puts every route that loads owner data behind the middleware prefix", () => {
    const open = Object.entries(ROUTES)
      .filter(([, entry]) => entry.ownerData && entry.guard !== "middleware-prefix")
      .map(([route]) => route);

    expect(open, "an owner page must be middleware-prefix, which means a path under /dashboard").toEqual([]);
  });

  it("puts every middleware-prefix route under the protected prefix", () => {
    const outside = Object.entries(ROUTES)
      .filter(([route, entry]) => entry.guard === "middleware-prefix" && !route.startsWith(PROTECTED_PREFIX))
      .map(([route]) => route);

    expect(outside, `middleware-prefix routes must start with ${PROTECTED_PREFIX}`).toEqual([]);
  });

  it("does not let a page read owner data while its entry says it does not", () => {
    // The table's ownerData flag is hand-written, so cross-check the source: a page that builds a Supabase client
    // (pageClient or createClient) reads data on behalf of the signed-in user and must be middleware-prefix.
    const unguarded = pageFiles
      .filter((page) => page.file.endsWith(".astro"))
      .filter((page) => /\b(pageClient|createClient)\b/.test(readFileSync(page.path, "utf8")))
      .filter((page) => !(page.route in ROUTES) || ROUTES[page.route].guard !== "middleware-prefix")
      .map((page) => page.file);

    expect(unguarded, "a page that builds a Supabase client must sit behind the middleware prefix").toEqual([]);
  });

  it("keeps every mutating route under /api/, where the middleware Origin check applies", () => {
    const outside = Object.entries(ROUTES)
      .filter(([route, entry]) => entry.mutates && !route.startsWith("/api/"))
      .map(([route]) => route);

    expect(outside).toEqual([]);
  });

  it("keeps cookie-authenticated mutating routes out of the token exemption", () => {
    // /api/notes is cookie-authenticated; the only token route is /api/ingest.
    const tokenRoutes = Object.entries(ROUTES)
      .filter(([, entry]) => entry.guard === "token")
      .map(([route]) => route);

    expect(tokenRoutes).toEqual(["/api/ingest"]);
  });
});
