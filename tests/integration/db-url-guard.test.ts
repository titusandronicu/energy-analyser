import { afterEach, describe, expect, it } from "vitest";
import { requireDbUrl } from "../e2e/support/env";
import { requirePrivileged } from "./support/privileged";

// Two copies of one guard stand between a test run and a database that is not the local stack: requirePrivileged (the
// integration suite) and requireDbUrl (the e2e teardown, whose DELETE runs behind it). They must refuse the same
// things, so both go through the same table. Nothing here connects to a database: the guards only resolve a string.

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
