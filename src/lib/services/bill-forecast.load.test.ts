import { expect, it } from "vitest";

// The module builds its Intl number formatters when it is imported, so a bad locale, style or option throws on load.
// Importing inside a test turns that crash into a failing test; with a static import the whole file fails to load,
// which Stryker's Vitest runner reports as a surviving mutant rather than a killed one.
it("builds its number formatters on import", async () => {
  const mod = await import("./bill-forecast");
  expect(mod.MIN_COMPLETE_DAYS).toBe(7);
});
