import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnonClient, createClient } from "./supabase";

// All keys here are synthetic. supabase.ts creates clients with the real packages, which a unit test must not do, so
// both are replaced with spies: what is under test is the key check, not Supabase.

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
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: packages.createServerClient, parseCookieHeader: () => [] }));
vi.mock("@supabase/supabase-js", () => ({ createClient: packages.createClient }));

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (payload: unknown) => `${encode({ alg: "HS256" })}.${encode(payload)}.signature`;

const headers = new Headers();
const cookies = { set: vi.fn() } as never;

beforeEach(() => {
  env.SUPABASE_URL = "http://127.0.0.1:54321";
  env.SUPABASE_ANON_KEY = "sb_publishable_not-a-real-key";
  env.APP_ORIGIN = undefined;
  packages.createServerClient.mockClear();
  packages.createClient.mockClear();
});

describe("the anon key check", () => {
  it.each([
    ["an sb_secret_ key", "sb_secret_not-a-real-key", /secret key/],
    ["a service_role JWT", jwt({ role: "service_role" }), /service_role key/],
    ["a four-part token with a service_role payload", `${jwt({ role: "service_role" })}.extra`, /service_role key/],
    ["an opaque key", "opaque-key-value", /sb_publishable_ key or a JWT with role anon/],
    ["a JWT with role authenticated", jwt({ role: "authenticated" }), /sb_publishable_ key or a JWT with role anon/],
    [
      "a publishable key with a leading space",
      " sb_publishable_not-a-real-key",
      /sb_publishable_ key or a JWT with role anon/,
    ],
    [
      "an anon JWT with a trailing newline",
      `${jwt({ role: "anon" })}\n`,
      /sb_publishable_ key or a JWT with role anon/,
    ],
  ])("refuses %s in both factories and creates no client", (_label, key, message) => {
    env.SUPABASE_ANON_KEY = key;

    expect(() => createAnonClient()).toThrow(message);
    expect(() => createClient(headers, cookies)).toThrow(message);
    expect(packages.createClient).not.toHaveBeenCalled();
    expect(packages.createServerClient).not.toHaveBeenCalled();
  });

  it.each([
    ["an sb_secret_ key", "sb_secret_not-a-real-key"],
    ["an opaque key", "opaque-key-value"],
  ])("never puts %s into its refusal", (_label, key) => {
    env.SUPABASE_ANON_KEY = key;

    expect(() => createAnonClient()).toThrow();
    try {
      createAnonClient();
    } catch (error) {
      expect(String(error)).not.toContain(key);
    }
  });

  it.each([
    ["a publishable key", "sb_publishable_not-a-real-key"],
    ["an anon JWT", jwt({ role: "anon" })],
  ])("accepts %s", (_label, key) => {
    env.SUPABASE_ANON_KEY = key;

    expect(createAnonClient()).toEqual({ kind: "anon" });
    expect(createClient(headers, cookies)).toEqual({ kind: "server" });
  });

  it.each([
    ["no URL", undefined, "sb_secret_not-a-real-key"],
    ["no key", "http://127.0.0.1:54321", undefined],
  ])("returns null and checks nothing with %s", (_label, url, key) => {
    env.SUPABASE_URL = url;
    env.SUPABASE_ANON_KEY = key;

    expect(createAnonClient()).toBeNull();
    expect(createClient(headers, cookies)).toBeNull();
  });
});
