// Pushes a fixture built from docs/ingest/example-v1.json (with captured_at set to now) to a running app,
// to verify an environment before the home lab is wired. The token is read from the environment only.
// By default only the live `state` section is sent: the example's recommendation, daily history and bill
// forecast are made up and would be kept (recommendations permanently), so use --full only against local
// databases.
// --file <path> sends a whole body from another file instead (the variants in scripts/fixtures/), which is
// local-only for the same reason.
// --allow-remote lifts the guard that refuses a whole body (--file or --full) for a BASE_URL that is not
// localhost, 127.0.0.1, [::1] or *.localhost. It exists for a deliberate staging push: a whole body writes
// made-up recommendations and daily rows. The default state-only push to a remote server is always allowed. --keep-generated-at leaves the body's own bill_forecast.generated_at
// alone, for the variants that are about a stale forecast.
// --captured-at <iso> sets captured_at instead of now (the contract accepts at most 5 minutes in the future and
// up to 14 days back). --shift-days moves every daily_history day by the same number of days so the newest day
// becomes the Europe/Warsaw calendar day of the capture time actually sent (--captured-at when given, else now;
// the machine's zone is not used); together with --captured-at that is how the
// scenarios in scripts/fixtures/live-flow/ are pushed at any time of day. Stale is `normal` pushed with
// --captured-at set 40 minutes back.
//
// Live-flow scenarios (local databases only, like every whole body):
// - `live_state` is the newest push by captured_at, and a daily row is replaced only by a push with an equal or
//   later captured_at. Between scenarios reset ingest_pushes and daily_energy on the local database, or push in a
//   fixed order, stale (the oldest capture) first.
// - Fresh scenarios need a capture time within 5 minutes of now (the default, now), or the card shows them stale.
// - The PV verdict is rated from 15:00 and the consumption verdict from 06:00 Warsaw time at the capture, so push
//   those scenarios after 15:05 (PV) / 06:05 (consumption): the capture is then at or after the rating hour and
//   still fresh. That also limits when their screenshots can be taken.
// - The verdicts also depend on the month (the expected PV share table in src/lib/services/live-state.ts): the
//   fixtures are tuned for September to October.
// Usage: BASE_URL=https://… INGEST_TOKEN=… node scripts/push-fixture.mjs [--full] [--file <path>] [--keep-generated-at] [--captured-at <iso>] [--shift-days] [--allow-remote]
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const usage =
  "Usage: BASE_URL=<app origin> INGEST_TOKEN=<token> node scripts/push-fixture.mjs [--full] [--file <path>] [--keep-generated-at] [--captured-at <iso>] [--shift-days] [--allow-remote]";

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

const capturedAtFlag = process.argv.indexOf("--captured-at");
const capturedAtValue = capturedAtFlag === -1 ? null : process.argv[capturedAtFlag + 1];
if (capturedAtFlag !== -1 && (!capturedAtValue || capturedAtValue.startsWith("--"))) {
  console.error(`--captured-at needs an ISO timestamp\n${usage}`);
  process.exit(1);
}
const capturedAtOverride = capturedAtValue === null ? null : new Date(capturedAtValue);
if (capturedAtOverride !== null && Number.isNaN(capturedAtOverride.getTime())) {
  console.error(`--captured-at is not a valid timestamp: ${capturedAtValue}\n${usage}`);
  process.exit(1);
}

// A named file is always sent whole: its point is the sections the default push strips.
const source = filePath ?? new URL("../docs/ingest/example-v1.json", import.meta.url);
let fixture;
try {
  fixture = JSON.parse(readFileSync(source, "utf8"));
} catch (error) {
  console.error(`cannot read ${filePath ?? "docs/ingest/example-v1.json"}: ${error.message}`);
  process.exit(1);
}
const {
  recommendation: _recommendation,
  daily_history: _dailyHistory,
  bill_forecast: _billForecast,
  ...stateOnly
} = fixture;
const full = filePath !== null || process.argv.includes("--full");
const body = full ? fixture : stateOnly;

// A whole body writes made-up recommendations (never pruned) and daily rows, so it is local-only unless the
// caller says a remote push is deliberate.
function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) || hostname.endsWith(".localhost");
}
let baseHost;
try {
  baseHost = new URL(BASE_URL).hostname;
} catch {
  console.error(`BASE_URL is not a valid URL: ${BASE_URL}\n${usage}`);
  process.exit(1);
}
if (full && !isLocalHost(baseHost) && !process.argv.includes("--allow-remote")) {
  console.error(
    `refusing to send a whole body (--file or --full) to ${baseHost}: it writes made-up recommendations and daily rows. Pass --allow-remote for a deliberate staging push.\n${usage}`,
  );
  process.exit(1);
}

// The bill forecast's own generated_at decides whether the card shows a figure, and the committed bodies
// carry fixed timestamps (so the strict parse and the schema drift assertion stay deterministic). Without
// this rewrite every push would render the stale state and the happy path would never be exercised.
const captureTime = capturedAtOverride ?? new Date();
const capturedAt = captureTime.toISOString();
const rewriteGeneratedAt = body.bill_forecast && !process.argv.includes("--keep-generated-at");

// Calendar arithmetic on "YYYY-MM-DD" keys in UTC, where every day has 24 hours, so DST cannot shift a day.
const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / DAY_MS;
const dayKey = (number) => new Date(number * DAY_MS).toISOString().slice(0, 10);
// The Europe/Warsaw calendar date of an instant whatever the machine's zone ("en-CA" formats as YYYY-MM-DD).
const warsawDay = (instant) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(instant);

let dailyHistory = body.daily_history;
if (process.argv.includes("--shift-days")) {
  if (!dailyHistory?.length) {
    console.error(`--shift-days needs a body with daily_history\n${usage}`);
    process.exit(1);
  }
  const targetDay = warsawDay(captureTime);
  const shift = dayNumber(targetDay) - Math.max(...dailyHistory.map((entry) => dayNumber(entry.day)));
  dailyHistory = dailyHistory.map((entry) => ({ ...entry, day: dayKey(dayNumber(entry.day) + shift) }));
  console.log(`daily_history shifted by ${String(shift)} day(s): newest day is now ${targetDay}`);
}

const payload = {
  ...body,
  captured_at: capturedAt,
  ...(dailyHistory === undefined ? {} : { daily_history: dailyHistory }),
  ...(rewriteGeneratedAt ? { bill_forecast: { ...body.bill_forecast, generated_at: capturedAt } } : {}),
};

// Say so out loud: a silent rewrite makes the stale-forecast variants look like they were exercised.
if (rewriteGeneratedAt) {
  console.log("bill_forecast.generated_at rewritten to now (use --keep-generated-at to preserve it)");
}

const response = await fetch(new URL("/api/ingest", BASE_URL), {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${INGEST_TOKEN}` },
  body: JSON.stringify(payload),
});

console.log(`${response.status} ${await response.text()}`);
process.exit(response.ok ? 0 : 1);
