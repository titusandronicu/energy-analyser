import { afterEach, describe, expect, it } from "vitest";
import { requireDbUrl, requireStackEnv } from "../e2e/support/env";
import { requirePrivileged } from "./support/privileged";
import { requireStack } from "./support/stack";

// Copies of one guard stand between a test run and a database that is not the local stack: requirePrivileged (the
// integration suite) and requireDbUrl (the e2e teardown, whose DELETE runs behind it) for the database URL, and
// requireStack (integration) and requireStackEnv (e2e) for the API URL and key. Each pair must refuse the same
// things, so each goes through the same table. Nothing here connects to a database: the guards only resolve strings.

const DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const original = process.env.SUPABASE_DB_URL;

afterEach(() => {
  if (original === undefined) delete process.env.SUPABASE_DB_URL;
  else process.env.SUPABASE_DB_URL = original;
});

function resolveWith(guard: () => string, value: string | undefined): string {
  if (value === undefined) delete process.env.SUPABASE_DB_URL;
  else process.env.SUPABASE_DB_URL = value;
  return guard();
}

describe.each([
  ["requirePrivileged (integration suite)", requirePrivileged],
  ["requireDbUrl (e2e teardown)", requireDbUrl],
])("%s", (_name, guard) => {
  it.each([undefined, "", "   "])("falls back to the local default for %j", (value) => {
    expect(resolveWith(guard, value)).toBe(DEFAULT_URL);
  });

  it.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://u:p@localhost:5432/db",
    "postgresql://u:p@127.0.0.1:54322/postgres?sslmode=disable",
  ])("accepts the local URL %s", (url) => {
    expect(resolveWith(guard, url)).toBe(url);
  });

  it.each([
    ["another host", "postgresql://u:p@db.example.com:5432/postgres"],
    ["a host hidden in the userinfo", "postgresql://127.0.0.1@evil.example.com/postgres"],
    ["a host query parameter", "postgresql://u:p@127.0.0.1:54322/postgres?host=db.example.com"],
    ["a hostaddr query parameter", "postgresql://u:p@127.0.0.1:54322/postgres?hostaddr=203.0.113.9"],
    ["a port query parameter", "postgresql://u:p@127.0.0.1:54322/postgres?port=5432"],
    ["a host parameter in capitals", "postgresql://u:p@127.0.0.1:54322/postgres?HOST=db.example.com"],
    ["a value that is not a URL", "not a url"],
  ])("refuses %s", (_label, url) => {
    expect(() => resolveWith(guard, url)).toThrow();
  });

  it("never puts the password into its refusal", () => {
    const url = "postgresql://postgres:hunter2-not-a-real-password@127.0.0.1:54322/postgres?host=db.example.com";

    expect(() => resolveWith(guard, url)).toThrow(/Refusing/);
    try {
      resolveWith(guard, url);
    } catch (error) {
      expect(String(error)).not.toContain("hunter2-not-a-real-password");
    }
  });
});

const STACK_URL = "http://127.0.0.1:54321";
const PUBLISHABLE_KEY = "sb_publishable_not-a-real-key";
const originalStack = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };

function jwtWithRole(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
}

function stackWith(guard: () => { url: string; anonKey: string }, url: string | undefined, key: string | undefined) {
  if (url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = url;
  if (key === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = key;
  return guard();
}

afterEach(() => {
  if (originalStack.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalStack.url;
  if (originalStack.key === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = originalStack.key;
});

describe.each([
  ["requireStack (integration suite)", requireStack],
  ["requireStackEnv (e2e run)", requireStackEnv],
])("%s", (_name, guard) => {
  it.each([
    ["a publishable key", PUBLISHABLE_KEY],
    ["a JWT with role anon", jwtWithRole("anon")],
  ])("accepts the local URL with %s", (_label, key) => {
    expect(stackWith(guard, STACK_URL, key)).toMatchObject({ anonKey: key });
    expect(stackWith(guard, "http://localhost:54321", key).url).toContain("localhost");
  });

  it.each([
    ["no URL", undefined, PUBLISHABLE_KEY],
    ["no key", STACK_URL, undefined],
    ["an empty key", STACK_URL, "   "],
  ])("refuses %s", (_label, url, key) => {
    expect(() => stackWith(guard, url, key)).toThrow();
  });

  it.each([
    ["another host", "http://db.example.com:54321"],
    ["a host hidden in the userinfo", "http://127.0.0.1@evil.example.com:54321"],
    ["https", "https://127.0.0.1:54321"],
    ["a value that is not a URL", "not a url"],
  ])("refuses %s", (_label, url) => {
    expect(() => stackWith(guard, url, PUBLISHABLE_KEY)).toThrow();
  });

  it.each([
    ["an sb_secret_ key", "sb_secret_not-a-real-key", /secret or service_role/],
    ["a JWT with role service_role", jwtWithRole("service_role"), /secret or service_role/],
    ["a JWT with another role", jwtWithRole("authenticated"), /must be the anon key/],
    ["a key that is neither shape", "just-a-string", /must be the anon key/],
    ["a JWT-shaped key that does not decode", "a.b.c", /must be the anon key/],
  ])("refuses %s as the anon key, without echoing it", (_label, key, message) => {
    expect(() => stackWith(guard, STACK_URL, key)).toThrow(message);
    try {
      stackWith(guard, STACK_URL, key);
    } catch (error) {
      expect(String(error)).not.toContain(key);
    }
  });
});

// The one behavioural difference between the two stack guards: the e2e one hands the URL on without trailing slashes,
// the integration one returns it as given.
describe("trailing slashes on SUPABASE_URL", () => {
  it("are stripped by requireStackEnv (e2e run)", () => {
    expect(stackWith(requireStackEnv, "http://127.0.0.1:54321///", PUBLISHABLE_KEY).url).toBe("http://127.0.0.1:54321");
  });

  it("are kept by requireStack (integration suite)", () => {
    expect(stackWith(requireStack, "http://127.0.0.1:54321/", PUBLISHABLE_KEY).url).toBe("http://127.0.0.1:54321/");
  });
});
