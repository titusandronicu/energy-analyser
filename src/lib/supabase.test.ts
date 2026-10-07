import { beforeEach, describe, expect, it, vi } from "vitest";

// All keys here are synthetic. supabase.ts creates clients with the real packages, which a unit test must not do, so
// both are replaced with spies: what is under test is the key check and what it logs, not Supabase.

interface TestEnv {
  SUPABASE_URL: string | undefined;
  SUPABASE_ANON_KEY: string | undefined;
  APP_ORIGIN: string | undefined;
}
const env = vi.hoisted<TestEnv>(() => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: undefined,
  APP_ORIGIN: undefined,
}));
const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
const packages = vi.hoisted(() => ({
  createServerClient: vi.fn(() => ({ kind: "server" })),
  createClient: vi.fn(() => ({ kind: "anon" })),
}));

vi.mock("astro:env/server", () => ({
  // Getters, so each test sets the values it needs before calling the factories.
  get SUPABASE_URL() {
    return env.SUPABASE_URL;
  },
  get SUPABASE_ANON_KEY() {
    return env.SUPABASE_ANON_KEY;
  },
  get APP_ORIGIN() {
    return env.APP_ORIGIN;
  },
  APP_VERSION: "test",
  APP_ENV: "test",
}));
vi.mock("@/lib/logger", () => ({ createLogger: () => log }));
vi.mock("@supabase/ssr", () => ({ createServerClient: packages.createServerClient, parseCookieHeader: () => [] }));
vi.mock("@supabase/supabase-js", () => ({ createClient: packages.createClient }));

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (payload: unknown) => `${encode({ alg: "HS256" })}.${encode(payload)}.signature`;

const headers = new Headers();
const cookies = { set: vi.fn() } as never;

// The warning is once per process, so every test starts from a fresh copy of the module.
async function load() {
  vi.resetModules();
  return await import("./supabase");
}

beforeEach(() => {
  env.SUPABASE_URL = "http://127.0.0.1:54321";
  env.SUPABASE_ANON_KEY = "sb_publishable_not-a-real-key";
  env.APP_ORIGIN = undefined;
  log.warn.mockClear();
  log.error.mockClear();
  packages.createServerClient.mockClear();
  packages.createClient.mockClear();
});

describe("the anon key check", () => {
  it.each([
    ["an sb_secret_ key", "sb_secret_not-a-real-key", /secret key/],
    ["a service_role JWT", jwt({ role: "service_role" }), /service_role key/],
    ["a four-part token with a service_role payload", `${jwt({ role: "service_role" })}.extra`, /service_role key/],
  ])("refuses %s in both factories and creates no client", async (_label, key, message) => {
    env.SUPABASE_ANON_KEY = key;
    const { createAnonClient, createClient } = await load();

    expect(() => createAnonClient()).toThrow(message);
    expect(() => createClient(headers, cookies)).toThrow(message);
    expect(packages.createClient).not.toHaveBeenCalled();
    expect(packages.createServerClient).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["a publishable key", "sb_publishable_not-a-real-key"],
    ["an anon JWT", jwt({ role: "anon" })],
  ])("accepts %s without a warning", async (_label, key) => {
    env.SUPABASE_ANON_KEY = key;
    const { createAnonClient, createClient } = await load();

    expect(createAnonClient()).toEqual({ kind: "anon" });
    expect(createClient(headers, cookies)).toEqual({ kind: "server" });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["an opaque key", "opaque-key-value"],
    ["a JWT with role authenticated", jwt({ role: "authenticated" })],
    ["a publishable key with a leading space", " sb_publishable_not-a-real-key"],
  ])("lets %s through and reports it once, by class only", async (_label, key) => {
    env.SUPABASE_ANON_KEY = key;
    const { createAnonClient, createClient } = await load();

    expect(createAnonClient()).toEqual({ kind: "anon" });
    expect(createClient(headers, cookies)).toEqual({ kind: "server" });
    expect(createAnonClient()).toEqual({ kind: "anon" });

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith("anon_key_unexpected_shape", { keyClass: "other" });
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(key.trim());
  });

  it("reports again in a new process (a fresh module), not on every call", async () => {
    env.SUPABASE_ANON_KEY = "opaque-key-value";
    (await load()).createAnonClient();
    (await load()).createAnonClient();

    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["no URL", undefined, "sb_secret_not-a-real-key"],
    ["no key", "http://127.0.0.1:54321", undefined],
  ])("returns null and checks nothing with %s", async (_label, url, key) => {
    env.SUPABASE_URL = url;
    env.SUPABASE_ANON_KEY = key;
    const { createAnonClient, createClient } = await load();

    expect(createAnonClient()).toBeNull();
    expect(createClient(headers, cookies)).toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });
});
