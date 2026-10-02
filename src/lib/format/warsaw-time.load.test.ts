import { expect, it } from "vitest";

// The module builds its Intl formatters when it is imported, so a bad locale, time zone or option throws on load.
// Importing inside a test turns that crash into a failing test; with a static import the whole file fails to load,
// which Stryker's Vitest runner reports as a surviving mutant rather than a killed one.
it("initialises its Intl formatters on import", async () => {
  const mod = await import("./warsaw-time");
  expect(mod.formatWeekday("2026-08-01")).toBe("sobota");
});
