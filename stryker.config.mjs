// Mutation testing for the pure logic in src/lib. Run on demand: npm run mutate
// (Vitest runner ignores coverageAnalysis and always uses perTest.)
// Needs Vitest 4: on Vitest 5 the runner reports every covered mutant as Survived (stryker-js#6210). CI pins it
// in .github/workflows/mutation.yml; locally run `npm i --no-save vitest@4.1.11` first and `npm ci` afterwards.
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
    "src/lib/services/alert-evaluation.ts",
    "src/lib/services/alert-rules.ts",
    "src/lib/anon-key.ts",
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
