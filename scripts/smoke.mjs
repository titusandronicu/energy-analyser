// Smoke test: proves the built Node app, the Supabase auth flow and the push ingestion path work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// Sign-in reads the magic-link email from Mailpit (MAILPIT_URL); ingest steps use the local/CI seed token;
// SUPABASE_URL + SUPABASE_ANON_KEY enable the direct-table check. Needs ALLOW_SIGNUP=true on the server.
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { URL } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const INGEST_TOKEN = process.env.INGEST_TOKEN ?? "local-dev-ingest-token-not-secret";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const email = `smoke-${Date.now()}@example.com`;
const jar = new Map();
let signinLink = "";

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, readBody = false } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  const body = readBody ? await response.text() : undefined;
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

// A recommendation generated "now", with a text unique to this run, pushed before the dashboard check.
const freshMarker = `Smoke rekomendacja ${Date.now()}`;
const freshPush = () =>
  ingest({
    ...example,
    captured_at: new Date(Date.now() - 60_000).toISOString(),
    recommendation: { ...example.recommendation, generated_at: new Date().toISOString(), text: freshMarker },
  });

const steps = [
  ["home redirects anonymous user to sign-in", () => request("/"), { status: 302, location: "/auth/signin" }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["password sign-up is gone", () => request("/auth/signup"), { status: 404 }],
  [
    "sign-in link request rejects an invalid email",
    () => request("/api/auth/magic-link", { method: "POST", form: { email: "not-an-email" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "sign-in link request goes to check-email",
    () => request("/api/auth/magic-link", { method: "POST", form: { email } }),
    { status: 302, location: "/auth/check-email" },
  ],
  ["sign-in email arrives in Mailpit", fetchSigninLink, { status: 200 }],
  ["sign-in link opens a session", () => request(signinLink), { status: 302, location: "/dashboard" }],
  ["home redirects signed-in owner to dashboard", () => request("/"), { status: 302, location: "/dashboard" }],
  ["fresh recommendation is pushed", freshPush, { status: 201 }],
  [
    "dashboard shows the fresh recommendation",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: freshMarker, notContains: "Nieaktualna" },
  ],
  ["used sign-in link is rejected", () => request(signinLink), { status: 302, location: "/auth/signin?error=" }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

// Polls Mailpit for this run's email and extracts the /auth/confirm link (200 once found).
async function fetchSigninLink() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages = [] } = await search.json();
    if (messages.length) {
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json();
      const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(message.HTML)?.[1];
      if (!href) return { status: 422, location: "email has no /auth/confirm link" };
      signinLink = href.replaceAll("&amp;", "&");
      return { status: 200, location: "" };
    }
    await sleep(500);
  }
  return { status: 404, location: "no email within 10 s" };
}

// Machine push: no cookies and no Origin header, like the home lab.
async function ingest(body, token = INGEST_TOKEN) {
  const response = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, location: "" };
}

const example = JSON.parse(readFileSync(new URL("../docs/ingest/example-v1.json", import.meta.url), "utf8"));
const payload = { ...example, captured_at: new Date().toISOString() };
const changed = { ...payload, state: { ...payload.state, pv_w: (payload.state.pv_w ?? 0) + 1 } };

steps.push(
  ["ingest rejects a missing token", () => ingest(payload, null), { status: 401 }],
  ["ingest rejects a wrong token", () => ingest(payload, "wrong-token"), { status: 401 }],
  ["ingest stores a new push without an Origin header", () => ingest(payload), { status: 201 }],
  ["ingest accepts an identical re-send as duplicate", () => ingest(payload), { status: 200 }],
  ["ingest rejects changed content at the same capture time", () => ingest(changed), { status: 409 }],
  ["ingest rejects unknown fields", () => ingest({ ...payload, customer_id: "x" }), { status: 422 }],
  ["ingest rejects an oversized body", () => ingest(" ".repeat(300 * 1024)), { status: 413 }],
);

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  steps.push([
    "anon cannot read ingested pushes directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/ingest_pushes?select=id`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read recommendations directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/recommendations?select=text`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
} else {
  console.log("SKIP  anon direct-table check (SUPABASE_URL / SUPABASE_ANON_KEY not set)");
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.contains === undefined || Boolean(actual.body?.includes(expected.contains))) &&
    (expected.notContains === undefined || !actual.body?.includes(expected.notContains));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
