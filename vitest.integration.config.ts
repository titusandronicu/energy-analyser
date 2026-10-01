import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration suite: needs a reachable local Supabase stack (see context/foundation/test-plan.md §6.2).
// Kept apart from vitest.config.ts so `npm test` and Stryker never collect these files.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    // The live views are global (newest push wins), so files and tests must not interleave.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
