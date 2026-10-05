import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";
import { queryError } from "./query-error";

describe("queryError", () => {
  it("keeps the '<what>: <reason>' message", () => {
    expect(queryError("loading live state failed", { message: "permission denied" }).message).toBe(
      "loading live state failed: permission denied",
    );
  });

  it("carries the original error as cause", () => {
    const original = { message: "permission denied", code: "42501", details: "d", hint: "h" };
    expect(queryError("loading X failed", original).cause).toBe(original);
  });

  it("lets the logger record the Postgres code from the cause", () => {
    const lines: string[] = [];
    const log = createLogger({ version: "v", environment: "test", write: (l) => lines.push(l) });
    log.error("section_load_failed", { err: queryError("loading X failed", { message: "denied", code: "42501" }) });
    expect(JSON.parse(lines[0])).toMatchObject({
      err: { name: "Error", message: "loading X failed: denied", cause: { message: "denied", code: "42501" } },
    });
  });
});
