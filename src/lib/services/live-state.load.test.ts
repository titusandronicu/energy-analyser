import { expect, it } from "vitest";

// The module builds its Intl number formatter when it is imported, so a bad locale or option throws on load.
// Importing inside a test turns that crash into a failing test; with a static import the whole file fails to load,
// which Stryker's Vitest runner reports as a surviving mutant rather than a killed one.
it("initialises its number formatter on import", async () => {
  const mod = await import("./live-state");
  expect(mod.formatAge(0)).toBe("0 min");
});
