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

async function request(path, { method = "GET", form, readBody = false, origin = BASE_URL } = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: origin,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  const body = readBody ? await response.text() : undefined;
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

// A recommendation generated "now", with a text unique to this run, pushed before the dashboard check.
// The bill forecast's generated_at is rewritten the same way and for the same reason: the example's fixed
// timestamp is always older than the card's 30-minute freshness rule, so without this the card would render
// its refusal state on every smoke run and the happy path would never be exercised.
const freshMarker = `Smoke rekomendacja ${Date.now()}`;
const freshPush = () =>
  ingest({
    ...example,
    captured_at: new Date(Date.now() - 60_000).toISOString(),
    recommendation: { ...example.recommendation, generated_at: new Date().toISOString(), text: freshMarker },
    bill_forecast: { ...example.bill_forecast, generated_at: new Date().toISOString() },
  });

// The history page opens on the current month or, while it has fewer than 7 complete days, the previous one; the
// current month's label ("wrzesień 2026") is on the page either way, as the heading or the "next month" link.
const currentMonthLabel = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  month: "long",
  year: "numeric",
}).format(new Date());

// Day notes (S-19): yesterday in Warsaw is always a day the calendar can open, so a note can be written on it. Every
// text is synthetic and unique to this run; the owner's flow ends by deleting the note again.
const warsawToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
const noteDay = new Date(Date.parse(`${warsawToday}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const noteDayPath = `/dashboard/history?day=${noteDay}`;
const noteMonthPath = `/dashboard/history?month=${noteDay.slice(0, 7)}`;
const noteStamp = Date.now();
const noteText = `Smoke notatka ${noteStamp} <b>pogrubiona</b>`;
// Astro escapes the text, so the page holds it as literal characters, never as markup.
const noteTextEscaped = `Smoke notatka ${noteStamp} &lt;b&gt;pogrubiona&lt;/b&gt;`;
const editedText = `Smoke notatka ${noteStamp} poprawiona`;
const signedOutText = `Smoke notatka bez sesji ${noteStamp}`;
const crossSiteText = `Smoke notatka z obcej strony ${noteStamp}`;
// A month cell's accessible name ends with this when the day has a note; the legend's entry has no leading comma.
const NOTE_MARKER = ", jest notatka</span>";
const postNote = (form, options = {}) =>
  request("/api/notes", { method: "POST", form: { day: noteDay, ...form }, ...options });

// The smoke matcher compares locations by prefix, so an invalid period's redirect checks the exact location itself:
// "/dashboard/history?month=bad" would also start with "/dashboard/history" (a redirect loop). A mismatch reports 399.
async function historyInvalidPeriod() {
  const result = await request("/dashboard/history?month=bad");
  return result.location === "/dashboard/history" ? result : { ...result, status: 399 };
}

const steps = [
  ["home redirects anonymous user to sign-in", () => request("/"), { status: 302, location: "/auth/signin" }],
  [
    "signed-out note post goes to sign-in",
    () => postNote({ intent: "save", text: signedOutText }),
    { status: 303, location: "/auth/signin" },
  ],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["history redirects anonymous user", () => request("/dashboard/history"), { status: 302, location: "/auth/signin" }],
  ["password sign-up is gone", () => request("/auth/signup"), { status: 404 }],
  [
    "sign-in page has a main landmark and a top-level heading",
    () => request("/auth/signin", { readBody: true }),
    { status: 200, contains: ["<main", "<h1"] },
  ],
  [
    "check-email page has a main landmark and a top-level heading",
    () => request("/auth/check-email", { readBody: true }),
    { status: 200, contains: ["<main", "<h1"] },
  ],
  [
    "home forwards a Supabase code to /auth/confirm",
    () => request("/?code=smoke-code"),
    { status: 302, location: "/auth/confirm?code=smoke-code" },
  ],
  [
    "an unknown code is rejected",
    () => request("/auth/confirm?code=smoke-code"),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "password sign-in rejects a wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong-password" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
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
  [
    "dashboard shows the fresh live state",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: ["Stan na żywo", "3,1 kW"], notContains: "Dane nieaktualne" },
  ],
  [
    // The fixture carries only two days of history, so the card shows its heading, not a flag.
    "dashboard shows the usage insight card",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: "Zużycie wczoraj", notContains: "Nie udało się wczytać porównania" },
  ],
  [
    // The example's own figures: 155–360 zł around 258. The card is deliberately red here — 257.73 is just
    // over +20% of August's real invoice (214.66) — so the marker is the range, not the verdict.
    "dashboard shows the bill forecast card",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: ["Prognoza rachunku", "od 155 zł do 360 zł", "ok. 258 zł"] },
  ],
  [
    "dashboard has a main landmark and a top-level heading",
    () => request("/dashboard", { readBody: true }),
    { status: 200, contains: ["<main", "<h1"] },
  ],
  [
    "history page has a main landmark, a top-level heading and the current month",
    () => request("/dashboard/history", { readBody: true }),
    { status: 200, contains: ["<main", "<h1", currentMonthLabel] },
  ],
  ["history redirects an invalid period to the default month", historyInvalidPeriod, { status: 302 }],
  [
    "note post from a foreign origin is forbidden",
    () => postNote({ intent: "save", text: crossSiteText }, { origin: "https://evil.example" }),
    { status: 403 },
  ],
  [
    "owner saves a note",
    () => postNote({ intent: "save", text: noteText }),
    { status: 303, location: `${noteDayPath}&note=saved` },
  ],
  [
    "day page shows the saved note as text, and no rejected one",
    () => request(`${noteDayPath}&note=saved`, { readBody: true }),
    {
      status: 200,
      contains: ['data-testid="history-day-note"', noteTextEscaped, "Notatka zapisana.", 'role="status"'],
      notContains: [`<b>pogrubiona</b>`, signedOutText, crossSiteText],
    },
  ],
  [
    "month page marks the noted day",
    () => request(noteMonthPath, { readBody: true }),
    { status: 200, contains: NOTE_MARKER },
  ],
  [
    "owner edits the note",
    () => postNote({ intent: "save", text: editedText }),
    { status: 303, location: `${noteDayPath}&note=saved` },
  ],
  [
    "day page shows the edited note",
    () => request(noteDayPath, { readBody: true }),
    { status: 200, contains: editedText, notContains: noteTextEscaped },
  ],
  [
    "a blank note is rejected",
    () => postNote({ intent: "save", text: "   " }),
    { status: 303, location: `${noteDayPath}&note=invalid` },
  ],
  [
    "owner deletes the note",
    () => postNote({ intent: "delete" }),
    { status: 303, location: `${noteDayPath}&note=deleted` },
  ],
  [
    "day page no longer shows the note",
    () => request(`${noteDayPath}&note=deleted`, { readBody: true }),
    { status: 200, contains: ["Notatka usunięta.", "Dodaj notatkę"], notContains: editedText },
  ],
  [
    "month page no longer marks the day",
    () => request(noteMonthPath, { readBody: true }),
    { status: 200, notContains: NOTE_MARKER },
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
  steps.push([
    "anon cannot read live state directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/live_state?select=state`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read daily energy directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/daily_energy?select=day`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read day notes directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/day_notes?select=day,text`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot write day notes directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/day_notes`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ day: noteDay, text: `Smoke notatka anonimowa ${noteStamp}` }),
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  steps.push([
    "anon cannot read bill forecast directly",
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/bill_forecast?select=bill_forecast`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      return { status: response.status, location: "" };
    },
    { status: 401 },
  ]);
  // Password alternative: create a local user with a password through Supabase, then sign in via the app.
  const passwordEmail = `smoke-pw-${Date.now()}@example.com`;
  const passwordValue = "Smoke-Test-Passw0rd!";
  // Signed-in REST read as the password user; returns the status and, with readBody, the parsed JSON rows.
  const ownerRead = async (path, { readBody = false } = {}) => {
    const session = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: passwordEmail, password: passwordValue }),
    }).then((response) => response.json());
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${String(session.access_token)}` },
    });
    return { status: response.status, location: "", rows: readBody ? await response.json() : undefined };
  };
  steps.push(
    [
      "local password user is created",
      async () => {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: passwordEmail, password: passwordValue }),
        });
        return { status: response.status, location: "" };
      },
      { status: 200 },
    ],
    [
      // Column grants: even a signed-in owner (every local user is one) can't read the token or hash columns.
      "signed-in user cannot read push token columns",
      () => ownerRead("ingest_pushes?select=token_id,payload_hash"),
      { status: 403 },
    ],
    [
      // RLS filtering everything out is still a 200 with an empty list, so require the fixture's daily rows
      // (the ingest steps above wrote two); an empty list reports 299.
      "signed-in owner can read daily energy totals",
      async () => {
        const result = await ownerRead("daily_energy?select=day,load_kwh,grid_import_kwh", { readBody: true });
        const empty = result.status === 200 && !(Array.isArray(result.rows) && result.rows.length >= 1);
        return empty ? { status: 299, location: "no daily rows visible" } : result;
      },
      { status: 200 },
    ],
    [
      "signed-in owner cannot read daily energy push_id",
      () => ownerRead("daily_energy?select=push_id"),
      { status: 403 },
    ],
    [
      "password sign-in opens a session",
      () => request("/api/auth/signin", { method: "POST", form: { email: passwordEmail, password: passwordValue } }),
      { status: 302, location: "/dashboard" },
    ],
    ["dashboard renders after password sign-in", () => request("/dashboard"), { status: 200 }],
    ["signout after password sign-in", () => request("/api/auth/signout", { method: "POST" }), { status: 302 }],
  );
} else {
  console.log("SKIP  anon direct-table and password checks (SUPABASE_URL / SUPABASE_ANON_KEY not set)");
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    [expected.contains ?? []].flat().every((text) => Boolean(actual.body?.includes(text))) &&
    [expected.notContains ?? []].flat().every((text) => !actual.body?.includes(text));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
