import { expect, it } from "vitest";

// The module builds its zod schemas when it is imported, and a malformed discriminated union throws on load.
// Importing inside a test turns that crash into a failing test; with a static import the whole file fails to load,
// which Stryker's Vitest runner reports as a surviving mutant rather than a killed one.
it("builds its schemas on import", async () => {
  const mod = await import("./contract");
  expect(mod.INGEST_CONTRACT_VERSION).toBe(1);
  expect(mod.ingestPayloadV1.shape.bill_forecast).toBeDefined();
});
