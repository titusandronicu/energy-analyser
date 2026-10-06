import { defineConfig, devices } from "@playwright/test";
import { requireStackEnv } from "./tests/e2e/support/env";

// Browser e2e: the production build served on a fixed local address, one signed-in owner, Chromium only. The rules are in
// context/foundation/test-stack.md; the reasoning is in context/changes/e2e-alert-rules/plan.md.

const HOST = "127.0.0.1";
const PORT = "4321";
const BASE_URL = `http://${HOST}:${PORT}`;
const CI = (process.env.CI ?? "") !== "";

// Fails before anything starts when the stack settings are missing or unsafe.
requireStackEnv();

const inherited = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  testDir: "tests/e2e",
  // No retries: a retry would hide the flakes this layer has to expose.
  retries: 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  globalTeardown: "./tests/e2e/global.teardown.ts",
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/owner.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run build && node ./dist/server/entry.mjs",
    url: `${BASE_URL}/api/health`,
    timeout: 180_000,
    // Never reuse a running server: a leftover one could serve a stale build, and a deliberate break in the markup would
    // then prove nothing. A taken port fails loudly instead.
    reuseExistingServer: false,
    // Show the build and server output (it is ignored by default), so a failed build or start says why instead of only
    // "Timed out waiting for webServer".
    stdout: "pipe",
    stderr: "pipe",
    // The Origin check of the middleware compares against APP_ORIGIN, so it must equal the browser's base URL.
    env: { ...inherited, HOST, PORT, APP_ORIGIN: BASE_URL, APP_VERSION: "e2e" },
  },
});
