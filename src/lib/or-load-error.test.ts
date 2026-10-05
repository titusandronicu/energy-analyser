import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";
import { orLoadError } from "./or-load-error";
import { queryError } from "./query-error";

function capture() {
  const lines: string[] = [];
  const log = createLogger({ version: "v1", environment: "test", write: (l) => lines.push(l) });
  return { log, parsed: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
}

describe("orLoadError", () => {
  it("returns the loaded value and logs nothing", async () => {
    const { log, parsed } = capture();
    await expect(orLoadError("dashboard.live-state", () => Promise.resolve(42), log)).resolves.toBe(42);
    expect(parsed()).toHaveLength(0);
  });

  it("returns null and logs one line with the section and the error when the load throws", async () => {
    const { log, parsed } = capture();
    const failing = () => Promise.reject(queryError("loading live state failed", { message: "denied", code: "42501" }));
    await expect(orLoadError("dashboard.live-state", failing, log)).resolves.toBeNull();
    expect(parsed()).toHaveLength(1);
    expect(parsed()[0]).toMatchObject({
      level: "error",
      event: "section_load_failed",
      section: "dashboard.live-state",
      err: { message: "loading live state failed: denied", cause: { code: "42501" } },
    });
  });

  it("logs through a request-scoped child, so the line carries the request id", async () => {
    const { log, parsed } = capture();
    await orLoadError(
      "history.day.view",
      () => Promise.reject(new Error("boom")),
      log.child({ requestId: "req-12345678" }),
    );
    expect(parsed()[0]).toMatchObject({ requestId: "req-12345678", section: "history.day.view" });
  });

  it("handles a rejection that is not an Error", async () => {
    const { log, parsed } = capture();
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection is the case under test
    const failing = () => Promise.reject("plain failure");
    await expect(orLoadError("x", failing, log)).resolves.toBeNull();
    expect(parsed()[0]).toMatchObject({ err: { value: "plain failure" } });
  });
});
