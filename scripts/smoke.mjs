// Smoke test: proves the built Node app, the Supabase auth flow and the push ingestion path work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// Ingest steps use the local/CI seed token; SUPABASE_URL + SUPABASE_ANON_KEY enable the direct-table check.
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const INGEST_TOKEN = process.env.INGEST_TOKEN ?? "local-dev-ingest-token-not-secret";
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

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

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
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
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

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
} else {
  console.log("SKIP  anon direct-table check (SUPABASE_URL / SUPABASE_ANON_KEY not set)");
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
