import { describe, expect, it } from "vitest";
import { requestIdFrom } from "./request-id";

const generated = () => "generated-id-0001";

describe("requestIdFrom", () => {
  it("keeps a valid inbound X-Request-Id", () => {
    const headers = new Headers({ "X-Request-Id": "abc-123_XYZ.456" });
    expect(requestIdFrom(headers, generated)).toBe("abc-123_XYZ.456");
  });

  it("generates an id when there is no inbound header", () => {
    expect(requestIdFrom(new Headers(), generated)).toBe("generated-id-0001");
  });

  it.each([
    ["too short", "abc123"],
    ["too long", "a".repeat(65)],
    ["with a space", "abc 12345678"],
    ["with markup", "<script>alert(1)</script>"],
    ["with a tab", "abcdefgh\tINJECTED"],
    ["with a quote", 'abc"def12345'],
  ])("replaces an inbound id that is %s", (_name, value) => {
    expect(requestIdFrom(new Headers({ "x-request-id": value }), generated)).toBe("generated-id-0001");
  });

  it("accepts exactly 8 and exactly 64 characters", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "a".repeat(8) }), generated)).toBe("a".repeat(8));
    expect(requestIdFrom(new Headers({ "x-request-id": "a".repeat(64) }), generated)).toBe("a".repeat(64));
  });

  it("generates a UUID by default", () => {
    expect(requestIdFrom(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
  });
});
