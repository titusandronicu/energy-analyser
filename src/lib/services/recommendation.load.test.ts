import { expect, it } from "vitest";

// The module formats FORECAST_HISTORY_START as it is imported, so a bad value throws on load. Importing inside a test
// turns that crash into a failing test; with a static import the whole file fails to load, which Stryker's Vitest
// runner reports as a surviving mutant rather than a killed one.
it("builds its forecast certainty on import", async () => {
  const mod = await import("./recommendation");
  expect(mod.FORECAST_HISTORY_START).toBe("2026-09-27");
});
