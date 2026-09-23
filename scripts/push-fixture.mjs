// Pushes docs/ingest/example-v1.json (with captured_at set to now) to a running app, to verify an
// environment before the home lab is wired. The token is read from the environment only.
// Usage: BASE_URL=https://… INGEST_TOKEN=… node scripts/push-fixture.mjs
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const { BASE_URL, INGEST_TOKEN } = process.env;
if (!BASE_URL || !INGEST_TOKEN) {
  console.error("Usage: BASE_URL=<app origin> INGEST_TOKEN=<token> node scripts/push-fixture.mjs");
  process.exit(1);
}

const example = JSON.parse(readFileSync(new URL("../docs/ingest/example-v1.json", import.meta.url), "utf8"));
const payload = { ...example, captured_at: new Date().toISOString() };

const response = await fetch(new URL("/api/ingest", BASE_URL), {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${INGEST_TOKEN}` },
  body: JSON.stringify(payload),
});

console.log(`${response.status} ${await response.text()}`);
process.exit(response.ok ? 0 : 1);
