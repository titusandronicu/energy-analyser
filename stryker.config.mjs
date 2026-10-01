// Mutation testing for the pure logic in src/lib. Run on demand: npm run mutate
// (Vitest runner ignores coverageAnalysis and always uses perTest.)
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.config.ts" },
  mutate: [
    "src/lib/services/bill-forecast.ts",
    "src/lib/services/period-rating.ts",
    "src/lib/services/usage-insight.ts",
    "src/lib/services/hourly-usage.ts",
    "src/lib/services/live-state.ts",
    "src/lib/services/recommendation.ts",
    "src/lib/services/period-summary.ts",
    "src/lib/bars.ts",
    "src/lib/sparkline.ts",
    "src/lib/flow-geometry.ts",
    "src/lib/calendar/**/*.ts",
    "src/lib/format/**/*.ts",
    "src/lib/ingest/contract.ts",
    "!src/**/*.test.ts",
  ],
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  thresholds: { high: 80, low: 60, break: null },
};
