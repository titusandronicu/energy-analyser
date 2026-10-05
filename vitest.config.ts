import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Astro's virtual modules do not exist outside the Astro build. Resolving their ids lets a unit test import a file that
// uses them (src/middleware.ts); the test supplies the exports with vi.mock("astro:...", factory). Only these two ids.
const ASTRO_VIRTUAL_MODULES = new Set(["astro:middleware", "astro:env/server"]);

export default defineConfig({
  plugins: [
    {
      name: "astro-virtual-modules-for-vitest",
      resolveId(id) {
        return ASTRO_VIRTUAL_MODULES.has(id) ? id : undefined;
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
