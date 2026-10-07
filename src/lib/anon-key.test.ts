import { describe, expect, it } from "vitest";
import { classifyAnonKey } from "./anon-key";

// All keys here are synthetic.

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (payload: unknown, parts = 3) =>
  [encode({ alg: "HS256", typ: "JWT" }), encode(payload), ...Array.from({ length: parts - 2 }, () => "signature")].join(
    ".",
  );

describe("classifyAnonKey", () => {
  it.each([
    ["an sb_publishable_ key", "sb_publishable_not-a-real-key", "publishable"],
    ["a three-part JWT with role anon", jwt({ role: "anon" }), "anon"],
    ["an sb_secret_ key", "sb_secret_not-a-real-key", "secret"],
    ["a three-part JWT with role service_role", jwt({ role: "service_role" }), "service_role"],
  ] as const)("classifies %s", (_label, key, expected) => {
    expect(classifyAnonKey(key)).toBe(expected);
  });

  it.each([
    ["a two-part token with a service_role payload", `${encode({ alg: "none" })}.${encode({ role: "service_role" })}`],
    ["a four-part token with a service_role payload", jwt({ role: "service_role" }, 4)],
  ])("refuses %s as service_role, whatever its shape", (_label, key) => {
    expect(classifyAnonKey(key)).toBe("service_role");
  });

  it.each([
    ["a secret key with a leading space", " sb_secret_not-a-real-key", "secret"],
    ["a service_role JWT with a trailing newline", `${jwt({ role: "service_role" })}\n`, "service_role"],
  ] as const)("still refuses %s", (_label, key, expected) => {
    expect(classifyAnonKey(key)).toBe(expected);
  });

  it("reads a payload written in the standard base64 alphabet", () => {
    const standard = Buffer.from(JSON.stringify({ role: "service_role", pad: "??>>" })).toString("base64");
    expect(classifyAnonKey(`h.${standard}.s`)).toBe("service_role");
  });

  it.each([
    ["an empty key", ""],
    ["a plain string", "just-a-string"],
    ["a JWT with role authenticated", jwt({ role: "authenticated" })],
    ["a JWT with a custom role", jwt({ role: "custom" })],
    ["a JWT without a role", jwt({ sub: "x" })],
    ["a JWT whose role is not a string", jwt({ role: 7 })],
    ["a JWT whose payload is not an object", jwt("anon")],
    ["a JWT whose payload is null", jwt(null)],
    ["a JWT whose payload is not JSON", `h.${Buffer.from("not json").toString("base64url")}.s`],
    ["a three-part token that does not decode", "a.b.c"],
    ["a four-part token with role anon", jwt({ role: "anon" }, 4)],
    ["a two-part token with role anon", `${encode({ alg: "none" })}.${encode({ role: "anon" })}`],
    ["a publishable key with a leading space", " sb_publishable_not-a-real-key"],
    ["an anon JWT with a trailing space", `${jwt({ role: "anon" })} `],
    ["an anon JWT with a trailing newline", `${jwt({ role: "anon" })}\n`],
  ])("calls %s other", (_label, key) => {
    expect(classifyAnonKey(key)).toBe("other");
  });
});
