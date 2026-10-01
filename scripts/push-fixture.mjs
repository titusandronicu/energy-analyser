// Pushes a fixture built from docs/ingest/example-v1.json (with captured_at set to now) to a running app,
// to verify an environment before the home lab is wired. The token is read from the environment only.
// By default only the live `state` section is sent: the example's recommendation, daily history, bill
// forecast, hourly history and period summaries are made up and would be kept (recommendations and period summaries
// permanently), so use --full only against local databases.
// --file <path> sends a whole body from another file instead (the variants in scripts/fixtures/), which is
// local-only for the same reason.
// --allow-remote lifts the guard that refuses a whole body (--file or --full) for a BASE_URL that is not
// localhost, 127.0.0.1, [::1] or *.localhost. It exists for a deliberate staging push: a whole body writes
// made-up recommendations, daily rows and hours. The default state-only push to a remote server is always allowed. --keep-generated-at leaves the body's own bill_forecast.generated_at
// alone, for the variants that are about a stale forecast, and likewise each period_summaries entry's built_at and
// narration.generated_at, which are otherwise rewritten to the capture time. The app keeps a summary row from the
// entry with the latest built_at, so pushing the example once more with an earlier --captured-at must leave the
// stored rows unchanged, and with a later one must replace them.
// --captured-at <iso> sets captured_at instead of now (the contract accepts at most 5 minutes in the future and
// up to 14 days back). --shift-days moves every daily_history day by the same number of days so the newest day
// becomes the Europe/Warsaw calendar day of the capture time actually sent (--captured-at when given, else now;
// the machine's zone is not used), and moves every hourly_history hour_start by the same number of 24-hour days
// (the example's hours sit on the day before its newest daily_history day, so they stay in the past); together
// with --captured-at that is how the
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
//
// Recommendation states (scripts/fixtures/recommendation/, local databases only, like every whole body):
// - --generated-at <iso> sets recommendation.generated_at instead of the body's own value, so a state (current,
//   older than 2 h, from an earlier day) can be pushed at any time. It needs a body with a recommendation, so
//   use --file or --full: the default state-only push strips it and the script exits with an error. It sets only
//   that field: it is independent of --captured-at, and the two may differ.
// - The recommendations table keeps the first push per generated_at (later pushes with the same value are
//   ignored) and the dashboard shows the newest by generated_at. Push oldest first (earlier day, then older
//   than 2 h, then current), or reset the local recommendations table between states.
//
// Synthetic hourly data (local databases only, like every whole body):
// - --hourly-days <n> (1–35) replaces hourly_history with made-up hours for the "Godziny zużycia" card: the n whole
//   Europe/Warsaw days before the capture day, plus the capture day's hours up to the last one that has ended, so the
//   card counts exactly n complete days (35 gives 34: the app prunes hours older than 35 × 24 hours). The load has
//   a daily shape (low at night, a morning and a larger evening peak), two of the days are high-load days, and the
//   capture day's first three hours are gaps (fewer than 10 of 12 readings), which also leaves last night incomplete
//   so the card falls back to the night before. It works with the default state-only push and with --full or --file.
// Usage: BASE_URL=https://… INGEST_TOKEN=… node scripts/push-fixture.mjs [--full] [--file <path>] [--keep-generated-at] [--captured-at <iso>] [--generated-at <iso>] [--shift-days] [--hourly-days <n>] [--allow-remote]
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const usage =
  "Usage: BASE_URL=<app origin> INGEST_TOKEN=<token> node scripts/push-fixture.mjs [--full] [--file <path>] [--keep-generated-at] [--captured-at <iso>] [--generated-at <iso>] [--shift-days] [--hourly-days <n>] [--allow-remote]";

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

const generatedAtFlag = process.argv.indexOf("--generated-at");
const generatedAtValue = generatedAtFlag === -1 ? null : process.argv[generatedAtFlag + 1];
if (generatedAtFlag !== -1 && (!generatedAtValue || generatedAtValue.startsWith("--"))) {
  console.error(`--generated-at needs an ISO timestamp\n${usage}`);
  process.exit(1);
}
const generatedAtOverride = generatedAtValue === null ? null : new Date(generatedAtValue);
if (generatedAtOverride !== null && Number.isNaN(generatedAtOverride.getTime())) {
  console.error(`--generated-at is not a valid timestamp: ${generatedAtValue}\n${usage}`);
  process.exit(1);
}

const hourlyDaysFlag = process.argv.indexOf("--hourly-days");
const hourlyDaysValue = hourlyDaysFlag === -1 ? null : process.argv[hourlyDaysFlag + 1];
const hourlyDays = hourlyDaysValue === null ? null : Number(hourlyDaysValue);
if (hourlyDays !== null && !(Number.isInteger(hourlyDays) && hourlyDays >= 1 && hourlyDays <= 35)) {
  console.error(`--hourly-days needs a whole number of days from 1 to 35\n${usage}`);
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
  hourly_history: _hourlyHistory,
  period_summaries: _periodSummaries,
  ...stateOnly
} = fixture;
const full = filePath !== null || process.argv.includes("--full");
const body = full ? fixture : stateOnly;

// The default state-only push strips the recommendation, so the flag has nothing to rewrite without a whole body.
if (generatedAtOverride !== null && !body.recommendation) {
  console.error(`--generated-at needs a body with a recommendation (use --file or --full)\n${usage}`);
  process.exit(1);
}

// A whole body writes made-up recommendations (never pruned), daily rows and hours, so it is local-only unless the
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
if ((full || hourlyDays !== null) && !isLocalHost(baseHost) && !process.argv.includes("--allow-remote")) {
  console.error(
    `refusing to send a whole body (--file, --full or --hourly-days) to ${baseHost}: it writes made-up recommendations, daily rows, hours and period summaries. Pass --allow-remote for a deliberate staging push.\n${usage}`,
  );
  process.exit(1);
}

// The bill forecast's own generated_at decides whether the card shows a figure, and the committed bodies
// carry fixed timestamps (so the strict parse and the schema drift assertion stay deterministic). Without
// this rewrite every push would render the stale state and the happy path would never be exercised.
const captureTime = capturedAtOverride ?? new Date();
const capturedAt = captureTime.toISOString();
const rewriteGeneratedAt = body.bill_forecast && !process.argv.includes("--keep-generated-at");
// The same for the period summaries: built_at decides which push's entry the app keeps, so the capture time stands
// in for "the lab built this now".
const rewriteBuiltAt = Array.isArray(body.period_summaries) && !process.argv.includes("--keep-generated-at");

// Calendar arithmetic on "YYYY-MM-DD" keys in UTC, where every day has 24 hours, so DST cannot shift a day.
const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / DAY_MS;
const dayKey = (number) => new Date(number * DAY_MS).toISOString().slice(0, 10);
// The Europe/Warsaw calendar date of an instant whatever the machine's zone ("en-CA" formats as YYYY-MM-DD).
const warsawDay = (instant) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(instant);

let dailyHistory = body.daily_history;
let hourlyHistory = body.hourly_history;
if (process.argv.includes("--shift-days")) {
  if (!dailyHistory?.length) {
    console.error(`--shift-days needs a body with daily_history\n${usage}`);
    process.exit(1);
  }
  const targetDay = warsawDay(captureTime);
  const shift = dayNumber(targetDay) - Math.max(...dailyHistory.map((entry) => dayNumber(entry.day)));
  dailyHistory = dailyHistory.map((entry) => ({ ...entry, day: dayKey(dayNumber(entry.day) + shift) }));
  console.log(`daily_history shifted by ${String(shift)} day(s): newest day is now ${targetDay}`);
  // Whole 24-hour steps on the instant: across a daylight-saving change the Warsaw clock hour moves by one, which
  // a fixture can live with.
  if (hourlyHistory?.length) {
    hourlyHistory = hourlyHistory.map((entry) => ({
      ...entry,
      hour_start: new Date(Date.parse(entry.hour_start) + shift * DAY_MS).toISOString(),
    }));
    console.log(`hourly_history shifted by ${String(shift)} day(s)`);
  }
}

// Made-up hours for --hourly-days. Deterministic, so two pushes of the same n at the same time give the same card.
const HOUR_MS = 60 * 60 * 1000;
const warsawHourOf = (ms) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(ms));
// A typical day's house use per clock hour (kWh): low at night, a morning peak, a larger evening peak.
const LOAD_SHAPE = [
  0.32, 0.28, 0.26, 0.25, 0.26, 0.3, 0.55, 0.85, 0.75, 0.5, 0.45, 0.5, 0.6, 0.55, 0.5, 0.55, 0.7, 0.95, 1.25, 1.4, 1.3,
  1.0, 0.7, 0.45,
];
// PV per clock hour on a clear-ish autumn day (kWh), zero outside daylight.
const PV_SHAPE = [0, 0, 0, 0, 0, 0, 0, 0.1, 0.5, 1.2, 1.9, 2.4, 2.6, 2.4, 1.9, 1.2, 0.5, 0.1, 0, 0, 0, 0, 0, 0];
// A repeatable number in [0, 1) for a seed, so the made-up figures vary without Math.random.
function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function syntheticHours(days, capture) {
  const lastStart = Math.floor(capture.getTime() / HOUR_MS) * HOUR_MS - HOUR_MS;
  const today = warsawDay(capture);
  const firstDay = dayKey(dayNumber(today) - days);
  // The day's first hour: the whole hour whose Warsaw date is firstDay and clock hour 0 (UTC+1 or UTC+2).
  let start = Date.parse(`${firstDay}T00:00:00Z`) - 3 * HOUR_MS;
  while (warsawDay(start) !== firstDay) start += HOUR_MS;
  // Two high-load days among the complete ones (the second and the sixth before today, or the oldest when fewer).
  const highDays = new Set([
    dayKey(dayNumber(today) - Math.min(2, days)),
    dayKey(dayNumber(today) - Math.min(6, days)),
  ]);
  const hours = [];
  for (let ms = start, i = 0; ms <= lastStart; ms += HOUR_MS, i++) {
    const day = warsawDay(ms);
    const hour = warsawHourOf(ms);
    const noise = 0.85 + 0.3 * pseudoRandom(i);
    const dayFactor = 0.6 + 0.4 * pseudoRandom(dayNumber(day) + 0.5);
    const high = highDays.has(day) && hour >= 12 ? 1.8 : 1;
    const load = LOAD_SHAPE[hour] * noise * high;
    const pv = PV_SHAPE[hour] * dayFactor;
    // At night the battery covers part of the load; by day the surplus is exported (negative net).
    const net = PV_SHAPE[hour] === 0 ? load * 0.7 : load - pv;
    const round = (value) => Math.round(value * 1000) / 1000;
    hours.push({
      hour_start: new Date(ms).toISOString(),
      load_kwh: round(load),
      grid_net_kwh: round(net),
      pv_kwh: round(pv),
      // The capture day's first three hours are gaps: fewer than the 10 of 12 readings a complete hour needs.
      samples: day === today && hour < 3 ? 7 + hour : 12,
    });
  }
  return hours;
}
if (hourlyDays !== null) {
  hourlyHistory = syntheticHours(hourlyDays, captureTime);
  console.log(
    `hourly_history replaced by ${String(hourlyHistory.length)} synthetic hours: ${String(hourlyDays)} whole day(s) up to the last complete hour`,
  );
}

const payload = {
  ...body,
  captured_at: capturedAt,
  ...(dailyHistory === undefined ? {} : { daily_history: dailyHistory }),
  ...(hourlyHistory === undefined ? {} : { hourly_history: hourlyHistory }),
  ...(rewriteGeneratedAt ? { bill_forecast: { ...body.bill_forecast, generated_at: capturedAt } } : {}),
  ...(rewriteBuiltAt
    ? {
        period_summaries: body.period_summaries.map((entry) => ({
          ...entry,
          built_at: capturedAt,
          narration: entry.narration ? { ...entry.narration, generated_at: capturedAt } : entry.narration,
        })),
      }
    : {}),
  ...(generatedAtOverride === null
    ? {}
    : { recommendation: { ...body.recommendation, generated_at: generatedAtOverride.toISOString() } }),
};

// Say so out loud: a silent rewrite makes the stale-forecast variants look like they were exercised.
if (rewriteGeneratedAt) {
  console.log("bill_forecast.generated_at rewritten to now (use --keep-generated-at to preserve it)");
}

if (rewriteBuiltAt) {
  console.log(
    `period_summaries built_at and narration.generated_at rewritten to ${capturedAt} (use --keep-generated-at to preserve them)`,
  );
}

if (generatedAtOverride !== null) {
  console.log(`recommendation.generated_at rewritten to ${generatedAtOverride.toISOString()}`);
}

const response = await fetch(new URL("/api/ingest", BASE_URL), {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${INGEST_TOKEN}` },
  body: JSON.stringify(payload),
});

console.log(`${response.status} ${await response.text()}`);
process.exit(response.ok ? 0 : 1);
