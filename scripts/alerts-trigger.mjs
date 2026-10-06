// Calls POST <ALERTS_URL>/api/alerts/evaluate on a fixed interval with the alerts token. It runs as the compose
// service `alerts-trigger` on the production host, from the same image as the app (compose.yaml, Dockerfile), and
// replaces GitHub's scheduler, which started the old workflow hours late or not at all (docs/decisions.md, 2026-10-06
// "alert trigger"). Dependency-free; the route answers with counts only, and this script never logs the token, the URL
// or a response body.
//
// Env (from /opt/energy-analyser/.env.alerts on the host): ALERTS_URL (the app's local address, no trailing slash),
// ALERTS_TOKEN, and optionally ALERTS_INTERVAL_SECONDS (whole seconds, 60-3600, default 300).
import { pathToFileURL } from "node:url";

export const DEFAULT_INTERVAL_SECONDS = 300;
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 3600;
const REQUEST_TIMEOUT_MS = 60_000;
// Gives the app a moment to come up after a deploy before the first call.
const START_DELAY_MS = 20_000;

// Validates the environment. The messages name the variable, never its value.
export function parseConfig(env) {
  const url = (env.ALERTS_URL ?? "").trim().replace(/\/+$/, "");
  const token = (env.ALERTS_TOKEN ?? "").trim();
  const rawInterval = (env.ALERTS_INTERVAL_SECONDS ?? "").trim();
  const seconds = rawInterval === "" ? DEFAULT_INTERVAL_SECONDS : Number(rawInterval);

  if (!/^https?:\/\/\S+$/.test(url)) return { error: "ALERTS_URL must be an http:// or https:// address" };
  if (token === "") return { error: "ALERTS_TOKEN is missing" };
  if (!Number.isInteger(seconds) || seconds < MIN_INTERVAL_SECONDS || seconds > MAX_INTERVAL_SECONDS) {
    return {
      error: `ALERTS_INTERVAL_SECONDS must be a whole number from ${MIN_INTERVAL_SECONDS} to ${MAX_INTERVAL_SECONDS}`,
    };
  }
  return { config: { url, token, intervalMs: seconds * 1000 } };
}

const countOrUndefined = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

// One call. Returns the HTTP status and, for a 2xx answer, the four counts the route reports; a failure is reduced to
// "timeout" or "network", so nothing from the request (the token sits in a header) can leak into a log line.
export async function runOnce({ url, token }, { fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  try {
    const response = await fetchImpl(`${url}/api/alerts/evaluate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, status: response.status };
    try {
      const body = await response.json();
      return {
        ok: true,
        status: response.status,
        evaluated: countOrUndefined(body.evaluated),
        sent: countOrUndefined(body.sent),
        unknown: countOrUndefined(body.unknown),
        failed: countOrUndefined(body.failed),
      };
    } catch {
      return { ok: true, status: response.status };
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { ok: false, status: null, error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
}

// One JSON line per event, like the app's logger (`ts`, `level`, `event`), so `docker compose logs` reads the same way.
function log(level, event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })}\n`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function main(env = process.env) {
  const parsed = parseConfig(env);
  if (parsed.error !== undefined) {
    log("error", "alerts_trigger_config", { reason: parsed.error });
    process.exit(1);
  }
  const { config } = parsed;

  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => process.exit(0));

  log("info", "alerts_trigger_start", { intervalSeconds: config.intervalMs / 1000 });
  await sleep(START_DELAY_MS);
  // The next call waits for the previous one to finish and then sleeps the full interval, so two calls never overlap.
  for (;;) {
    const result = await runOnce(config);
    log(result.ok ? "info" : "warn", "alerts_trigger", result);
    await sleep(config.intervalMs);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
