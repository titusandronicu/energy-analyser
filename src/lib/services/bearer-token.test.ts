import { describe, expect, it } from "vitest";
import { bearerToken } from "./bearer-token";

function withAuthorization(value: string | null): Request {
  return new Request("http://localhost/api/ingest", { headers: value === null ? {} : { Authorization: value } });
}

describe("bearerToken", () => {
  it.each([
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
    ["BEARER abc", "abc"],
    ["Bearer   abc", "abc"],
    ["Bearer abc   ", "abc"],
    ["Bearer a.b-c_d", "a.b-c_d"],
  ])("reads the token from %j", (header, token) => {
    expect(bearerToken(withAuthorization(header))).toBe(token);
  });

  it.each([
    ["a missing header", null],
    ["an empty header", ""],
    ["another scheme", "Basic abc"],
    ["a scheme without a token", "Bearer"],
    ["a scheme with only spaces", "Bearer   "],
    ["a token with inner whitespace", "Bearer abc def"],
    ["a token without the scheme", "abc"],
  ])("gives null for %s", (_label, header) => {
    expect(bearerToken(withAuthorization(header))).toBeNull();
  });
});
