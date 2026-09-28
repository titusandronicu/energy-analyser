// Pushes a fixture built from docs/ingest/example-v1.json (with captured_at set to now) to a running app,
// to verify an environment before the home lab is wired. The token is read from the environment only.
// By default only the live `state` section is sent: the example's recommendation, daily history and bill
// forecast are made up and would be kept (recommendations permanently), so use --full only against local
// databases.
// --file <path> sends a whole body from another file instead (the variants in scripts/fixtures/), which is
// local-only for the same reason. --keep-generated-at leaves the body's own bill_forecast.generated_at
// alone, for the variants that are about a stale forecast.
// Usage: BASE_URL=https://… INGEST_TOKEN=… node scripts/push-fixture.mjs [--full] [--file <path>] [--keep-generated-at]
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const usage =
  "Usage: BASE_URL=<app origin> INGEST_TOKEN=<token> node scripts/push-fixture.mjs [--full] [--file <path>] [--keep-generated-at]";

const { BASE_URL, INGEST_TOKEN } = process.env;
if (!BASE_URL || !INGEST_TOKEN) {
  console.error(usage);
  process.exit(1);
}

const fileFlag = process.argv.indexOf("--file");
const filePath = fileFlag === -1 ? null : process.argv[fileFlag + 1];
if (fileFlag !== -1 && (!filePath || filePath.startsWith("--"))) {
  console.error(`--file needs a path\n${usage}`);
  process.exit(1);
}

// A named file is always sent whole: its point is the sections the default push strips.
const fixture = JSON.parse(
  readFileSync(filePath ?? new URL("../docs/ingest/example-v1.json", import.meta.url), "utf8"),
);
const {
  recommendation: _recommendation,
  daily_history: _dailyHistory,
  bill_forecast: _billForecast,
  ...stateOnly
} = fixture;
const full = filePath !== null || process.argv.includes("--full");
const body = full ? fixture : stateOnly;

// The bill forecast's own generated_at decides whether the card shows a figure, and the committed bodies
// carry fixed timestamps (so the strict parse and the schema drift assertion stay deterministic). Without
// this rewrite every push would render the stale state and the happy path would never be exercised.
const capturedAt = new Date().toISOString();
const rewriteGeneratedAt = body.bill_forecast && !process.argv.includes("--keep-generated-at");
const payload = {
  ...body,
  captured_at: capturedAt,
  ...(rewriteGeneratedAt ? { bill_forecast: { ...body.bill_forecast, generated_at: capturedAt } } : {}),
};

const response = await fetch(new URL("/api/ingest", BASE_URL), {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${INGEST_TOKEN}` },
  body: JSON.stringify(payload),
});

console.log(`${response.status} ${await response.text()}`);
process.exit(response.ok ? 0 : 1);
